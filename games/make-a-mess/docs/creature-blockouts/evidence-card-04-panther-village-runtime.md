# Evidence card 04 — medium panther village runtime

Дата: 2026-08-13  
Статус: `runtime-m5 / articulated terrain and lookout perches`
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

Текущий профиль имеет skills `observe`, `territory-roam`, `play-sprint`,
`ground-bound` и `terrain-perch`. Симуляция действительно читает skills: профиль без
`play-sprint` не переходит в acceleration/gallop, без `ground-bound` не входит
в обычный прыжок, без `terrain-perch` не выбирает возвышение. Территория остаётся набором интересов; путь между ними выбирается по
живому полю препятствий и меняется после разрушения сцены.

## Runtime action loop

`observe → walk → trot → accelerate → gallop → bound preload → ballistic
flight → landing absorb → brake → observe`.

Второй, не обязательный для каждого цикла контур среды:
`observe → perch approach → preload → targeted ballistic flight → landing →
sit-observe → preload → ballistic descent → landing → brake`.

- скорость выводится из состояния и пройденного пути, а фаза walk/trot/gallop
  — из дистанции центра плюс дуга поворота корпуса, поэтому лапы не перебирают
  на месте при падении FPS и чаще переступают на крутом повороте;
- поворот ограничен скоростью: на галопе траектория является дугой, а не
  мгновенной сменой yaw;
- веер прогнозирующих лучей выбирает свободный обход домов, телег, загонов и
  целых/обрушенных кусков;
- прыжок имеет отдельные preload, flight и landing; world root несёт дугу,
  pose несёт работу позвоночника и конечностей;
- world-owned lookout разрешается только в живой отдельно стоящий landscape
  stone/basalt достаточной площади, высотой `0.5–1.35 m`; стены, фундаменты,
  крыши, стойки и галька не проходят фильтр;
- точка отталкивания лежит за краем камня, посадка — на реальной верхней грани;
  после разрушения piece немедленно перестаёт быть возможной целью;
- `sit-observe` складывает задние конечности, оставляет передние опорными и
  держит голову выше лежачего наблюдения;
- громкий acoustic event или близкое опасное присутствие переводит внимание
  на источник и заставляет сначала тормозить, не включая охоту или атаку.

## Contact and rendering contract

- один объединённый `BufferGeometry`, один standard material, одна palette из
  30 матриц;
- основной свет, туман и тень общие с миром; depth pass читает ту же palette;
- moving parts не имеют независимых rigid bodies или colliders;
- физика повреждений, атака, охота, ragdoll и контакт с игроком пока явно
  исключены;
- дискретные `contactPartIds` атласа остаются доказательством порядка касаний;
  runtime отдельно задаёт непрерывные duty factors: walk держит две-три опоры,
  trot — диагональную пару с разгрузкой, rotary gallop — одиночные контакты;
- каждая опорная лапа получает собственный world anchor. Цепи fore
  `scapula → forearm → carpus → paw` и hind `hip → knee → hock → paw`
  решаются до anchor; малая общая коррекция корпуса включается только когда
  предел одной цепи должен передать движение другой опоре;
- Y каждого anchor берётся вертикальным лучом с точной ориентированной
  поверхности под этой лапой. Один низкий камень поднимает одну лапу; высота
  корпуса берётся по самой низкой из четырёх опор и не телепортируется на
  верх предмета;
- после горизонтальной опоры quaternion interpolation дополняется единым
  вертикальным floor correction по каноническим paw boxes. Он устраняет провал
  между ключевыми кадрами, но больше не называется foot lock.

## Independent gates

| Invariant | Measurement |
| --- | --- |
| one geometry owner | каждая P4 part ровно один раз отображена на существующую M2 bone |
| exact scale | runtime bind bounds: floor `0`, crown `0.88 m`, nose `> 0.845 m`, tail `< -1.42 m` |
| one draw derivative | ожидаемое число вершин восстановлено из P4 boxes/beams/triangles |
| valid palette | каждая вершина имеет integer bone index внутри 30-bone skeleton |
| no terrain penetration | полный interpolated loop: нижняя точка geometry не ниже `-0.012 m` |
| planted paw owns stance | 50 s curved route / 60 Hz: mean paw speed `0.025 / 0.002 / <0.001 m/s` для walk/trot/gallop; p99 rejection `0.30 / 0.08 / 0.06 m/s` |
| turn is stepped, not pivoted | gait distance включает `0.9 m/rad` yaw arc; walk turn rate ограничен формулой `2.2 / (1 + 0.35·speed)` |
| live obstacle avoidance | 50 s / 1500 steps без входа в intact obstacle выше step height |
| non-linear territory motion | больше 100 turning samples, больше 70 m пути за forward-test |
| complete behaviour | все 9 runtime phases, speed `> 4.7 m/s`, bound apex `> 0.58 m` |
| skills cause behaviour | quiet profile остаётся ниже `2.4 m/s`, без gallop/bound |
| one paw owns a small step | test pebble `0.22 m`: root `<0.005 m`, одна paw anchor выше соседней `>0.17 m` |
| natural perch selection | две village survey boulders проходят; здания/декор не проходят; broken id исчезает |
| targeted raised landing | последовательность preload/flight/landing; root совпадает с stone top; apex выше top `>0.4 m`; pose `sit-observe` |

## Rejection conditions

- world runtime копирует или заново описывает пантеру;
- pose меняет меш вместо matrix palette;
- движение проходит сквозь целую высокую деталь деревни;
- между keyframes лапа уходит под поверхность;
- опорная лапа едет вместе с nav root или корпус поворачивается на одной
  неподвижной фазе шага;
- прыжок является только сменой pose без world trajectory;
- небольшой камень под одной лапой поднимает весь root;
- пантера садится на стену, фундамент, крышу или несущееся в воздухе место;
- высота посадки меняется без preload, баллистической дуги и absorb;
- пантера охотится или атакует без отдельного разрешённого milestone;
- дракон регистрируется вместе с пантерой по побочному условию.

## Forward-test status

Численные, геометрические и типовые гейты пройдены локально. M4 добавил
регрессионный curved-route gate после прямого пользовательского вердикта:
лапа визуально ехала почти со скоростью корпуса. До исправления измеренные
средние скорости опорной лапы составляли `0.840 m/s` на walk, `1.998 m/s` на
trot и `4.270 m/s` на gallop. После индивидуальных anchors и limb solve на
50-секундном маршруте они составляют примерно `0.025`, `0.002` и `<0.001 m/s`.

Мир подключает
ровно одну пантеру. Targeted world forward-test выполнен 2026-08-13 через
dev-only `?mamPantherProbe=1` на Windows runtime:

- 80 последовательных измерений за 20 секунд;
- наблюдались trot, accelerate, gallop, bound flight, landing, brake, observe
  и walk; короткий preload отдельно покрыт полным 50-секундным simulation gate;
- фактический максимум скорости `5.05 m/s`, отрыв `0.58 m`;
- surface height менялся от `0` до `0.34 m`, то есть root следовал рельефу;
- за один отрезок пантера прошла от `[6.50, 10.64]` до `[-9.97, 24.55]` с
  несколькими сменами направления;
- world frame подтвердил runtime body в масштабе жителей и травы; новых
  renderer/shader errors не обнаружено.

Это был приёмочный прогон механики, не отдельная постановочная съёмка.

M5 добавил индивидуальную 3D-поверхность лап и целевые возвышения. Два новых
валуна деревни остаются обычными разрушаемыми частями landscape; кошачий
профиль лишь связывает ближайший live stone с уже существующим lookout.
Targeted regression подтверждает баллистическую посадку на `0.83 m`, сидячее
наблюдение и баллистический сход. Отдельный small-stone regression подтверждает,
что `0.22 m` неровность меняет только anchor наступившей лапы, не root.
