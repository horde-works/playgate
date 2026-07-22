import type { Language } from "./config";

// Every user-facing string in the site chrome and the in-game HUD, written as
// idiomatic English, Spanish and Russian — meaning-first, not word-for-word.
// The game's own name ("Make a Mess") and in-world signage are never
// translated; those live in the 3D scenes, not here.
export const ui = {
  en: {
    "header.brandAria": "Handmade Games — home",
    "nav.games": "Games",
    "nav.about": "How we build",
    "header.note": "Built at home",
    "lang.aria": "Language",

    "home.eyebrow": "A home game lab",
    "home.title1": "Games we",
    "home.title2": "make ourselves.",
    "home.lede":
      "No store, no ads, no endless progression. We take an idea, build it by hand, and see what we actually want to play again.",
    "home.openCta": "Open Make a Mess",
    "home.catalogLink": "Browse the catalogue",
    "home.heroArtAria": "A wall of blocks flying apart",
    "home.featuredIndex": "01 / Building now",
    "home.featuredTitle": "The first experiment",
    "home.featuredLede":
      "A small space where every object knows what it is made of, what holds it up, and how it is meant to break.",
    "home.principlesIndex": "How we do it",
    "home.principlesTitle": "Feel first. Then scale.",
    "home.p1.title": "By hand",
    "home.p1.body": "Every game starts from a single mechanic you can feel.",
    "home.p2.title": "Honestly",
    "home.p2.body":
      "If breaking things isn't fun, no amount of content will save it.",
    "home.p3.title": "With care",
    "home.p3.body": "Good light, things you recognise, and physics with character.",
    "footer.place": "Almaty · 2026",

    "catalog.eyebrow": "Catalogue",
    "catalog.title1": "Small games.",
    "catalog.title2": "Big experiments.",
    "catalog.lede":
      "Each one gets its own space, rules and character. All they share is the home page and the wish to do it well.",
    "catalog.gridAria": "Games",
    "catalog.nextIndex": "Next slot",
    "catalog.nextTitle": "Empty for now",
    "catalog.nextBody": "The next game appears here once it has an idea.",
    "catalog.back": "Back home",

    "card.cta": "Into the game lab",

    "hud.homeAria": "Home",
    "hud.allGames": "All games",
    "hud.performanceAria": "Performance",
    "hud.parts": "parts",
    "hud.mess": "mess",
    "hud.weapon": "Weapon",
    "hud.time": "Time [N]",
    "hud.mode": "Mode [F]",
    "hud.launchAria": "Launch the 3D scene",

    "weapon.hammer": "Hammer",
    "weapon.launcher": "Grenade launcher",
    "weapon.launcher.short": "Grenade",
    "weapon.rocket": "Rocket launcher",
    "weapon.rocket.short": "Rocket",
    "weapon.mg": "Machine gun",

    "time.day": "Day",
    "time.sunset": "Sunset",
    "time.night": "Night",

    "mode.fly": "Flight",
    "mode.walk": "On foot",

    "fire.strike": "Strike",
    "fire.shoot": "Shoot",
    "fire.hold": "Fire (hold)",
    "fire.launch": "Launch",
    "fire.fire": "Fire",

    "controls.move": "Move",
    "controls.look": "Look",
    "controls.weapon": "Weapon",
    "controls.time": "Time of day",
    "controls.land": "Land",
    "controls.fly": "Flight mode",
    "controls.jump": "Jump",
    "controls.reset": "Restart",

    "gate.continueTitle": "Carry on the mess?",
    "gate.startTitle": "Everything can break.",

    "mobile.touchAria": "Touch controls",
    "mobile.moveAria": "Movement",
    "mobile.actionsAria": "Actions",
    "mobile.weaponAria": "Weapon",
    "mobile.serviceAria": "Utilities",
    "mobile.jump": "Jump",
  },
  es: {
    "header.brandAria": "Handmade Games — inicio",
    "nav.games": "Juegos",
    "nav.about": "Cómo lo hacemos",
    "header.note": "Hecho en casa",
    "lang.aria": "Idioma",

    "home.eyebrow": "Un laboratorio de juegos casero",
    "home.title1": "Juegos que",
    "home.title2": "hacemos nosotros.",
    "home.lede":
      "Sin tienda, sin anuncios, sin progresión infinita. Cogemos una idea, la construimos a mano y vemos a qué apetece volver a jugar.",
    "home.openCta": "Abrir Make a Mess",
    "home.catalogLink": "Ver el catálogo",
    "home.heroArtAria": "Un muro de bloques saltando en pedazos",
    "home.featuredIndex": "01 / En construcción",
    "home.featuredTitle": "El primer experimento",
    "home.featuredLede":
      "Un pequeño espacio donde cada objeto sabe de qué está hecho, sobre qué se apoya y cómo debe romperse.",
    "home.principlesIndex": "Cómo lo hacemos",
    "home.principlesTitle": "Primero la sensación. Luego la escala.",
    "home.p1.title": "A mano",
    "home.p1.body": "Cada juego empieza con una sola mecánica que se siente.",
    "home.p2.title": "Con honestidad",
    "home.p2.body":
      "Si romper cosas no divierte, ningún contenido lo va a salvar.",
    "home.p3.title": "Con gusto",
    "home.p3.body": "Buena luz, objetos reconocibles y una física con carácter.",
    "footer.place": "Almatý · 2026",

    "catalog.eyebrow": "Catálogo",
    "catalog.title1": "Juegos pequeños.",
    "catalog.title2": "Grandes experimentos.",
    "catalog.lede":
      "Cada uno tiene su propio espacio, reglas y carácter. Solo comparten la página principal y las ganas de hacerlo bien.",
    "catalog.gridAria": "Juegos",
    "catalog.nextIndex": "Siguiente hueco",
    "catalog.nextTitle": "Vacío por ahora",
    "catalog.nextBody": "El próximo juego aparecerá aquí cuando tenga una idea.",
    "catalog.back": "Volver al inicio",

    "card.cta": "Al laboratorio de juegos",

    "hud.homeAria": "Inicio",
    "hud.allGames": "Todos los juegos",
    "hud.performanceAria": "Rendimiento",
    "hud.parts": "piezas",
    "hud.mess": "caos",
    "hud.weapon": "Arma",
    "hud.time": "Hora [N]",
    "hud.mode": "Modo [F]",
    "hud.launchAria": "Iniciar la escena 3D",

    "weapon.hammer": "Martillo",
    "weapon.launcher": "Lanzagranadas",
    "weapon.launcher.short": "Granada",
    "weapon.rocket": "Lanzacohetes",
    "weapon.rocket.short": "Cohete",
    "weapon.mg": "Ametralladora",

    "time.day": "Día",
    "time.sunset": "Atardecer",
    "time.night": "Noche",

    "mode.fly": "Vuelo",
    "mode.walk": "A pie",

    "fire.strike": "Golpe",
    "fire.shoot": "Disparo",
    "fire.hold": "Fuego (mantener)",
    "fire.launch": "Lanzar",
    "fire.fire": "Fuego",

    "controls.move": "Moverse",
    "controls.look": "Mirar",
    "controls.weapon": "Arma",
    "controls.time": "Hora del día",
    "controls.land": "Aterrizar",
    "controls.fly": "Modo vuelo",
    "controls.jump": "Saltar",
    "controls.reset": "Reiniciar",

    "gate.continueTitle": "¿Seguimos el caos?",
    "gate.startTitle": "Todo se puede romper.",

    "mobile.touchAria": "Controles táctiles",
    "mobile.moveAria": "Movimiento",
    "mobile.actionsAria": "Acciones",
    "mobile.weaponAria": "Arma",
    "mobile.serviceAria": "Utilidades",
    "mobile.jump": "Saltar",
  },
  ru: {
    "header.brandAria": "Handmade Games — главная",
    "nav.games": "Игры",
    "nav.about": "Как делаем",
    "header.note": "Сделано дома",
    "lang.aria": "Язык",

    "home.eyebrow": "Домашняя игровая лаборатория",
    "home.title1": "Игры, которые",
    "home.title2": "мы делаем сами.",
    "home.lede":
      "Без магазина, рекламы и бесконечного прогресса. Просто берём идею, собираем её руками и смотрим, во что хочется играть ещё раз.",
    "home.openCta": "Открыть Make a Mess",
    "home.catalogLink": "Смотреть каталог",
    "home.heroArtAria": "Разлетающаяся стена из блоков",
    "home.featuredIndex": "01 / Сейчас строим",
    "home.featuredTitle": "Первый эксперимент",
    "home.featuredLede":
      "Небольшое пространство, где каждая вещь знает, из чего она сделана, на чём держится и как должна сломаться.",
    "home.principlesIndex": "Как мы это делаем",
    "home.principlesTitle": "Сначала ощущение. Потом масштаб.",
    "home.p1.title": "Руками",
    "home.p1.body": "Каждая игра начинается с одной понятной механики.",
    "home.p2.title": "Честно",
    "home.p2.body": "Если ломать не весело — никакой контент это не спасёт.",
    "home.p3.title": "По красоте",
    "home.p3.body": "Хороший свет, узнаваемые вещи и физика с характером.",
    "footer.place": "Алматы · 2026",

    "catalog.eyebrow": "Каталог",
    "catalog.title1": "Маленькие игры.",
    "catalog.title2": "Большие эксперименты.",
    "catalog.lede":
      "Каждая получает собственное пространство, правила и характер. Общими остаются только главная страница и желание сделать хорошо.",
    "catalog.gridAria": "Игры",
    "catalog.nextIndex": "Следующий слот",
    "catalog.nextTitle": "Пока пусто",
    "catalog.nextBody": "Здесь появится следующая игра, когда у неё появится идея.",
    "catalog.back": "На главную",

    "card.cta": "В игровую лабораторию",

    "hud.homeAria": "На главную",
    "hud.allGames": "Все игры",
    "hud.performanceAria": "Производительность",
    "hud.parts": "частей",
    "hud.mess": "хаос",
    "hud.weapon": "Оружие",
    "hud.time": "Время [N]",
    "hud.mode": "Режим [F]",
    "hud.launchAria": "Запуск трёхмерной сцены",

    "weapon.hammer": "Молоток",
    "weapon.launcher": "Гранатомёт",
    "weapon.launcher.short": "Граната",
    "weapon.rocket": "Ракетомёт",
    "weapon.rocket.short": "Ракета",
    "weapon.mg": "Пулемёт",

    "time.day": "День",
    "time.sunset": "Закат",
    "time.night": "Ночь",

    "mode.fly": "Полёт",
    "mode.walk": "Пешком",

    "fire.strike": "Удар",
    "fire.shoot": "Выстрел",
    "fire.hold": "Огонь (держать)",
    "fire.launch": "Пуск",
    "fire.fire": "Огонь",

    "controls.move": "Двигаться",
    "controls.look": "Смотреть",
    "controls.weapon": "Оружие",
    "controls.time": "Время суток",
    "controls.land": "Приземлиться",
    "controls.fly": "Режим полёта",
    "controls.jump": "Прыжок",
    "controls.reset": "Заново",

    "gate.continueTitle": "Продолжим беспорядок?",
    "gate.startTitle": "Всё можно сломать.",

    "mobile.touchAria": "Сенсорное управление",
    "mobile.moveAria": "Движение",
    "mobile.actionsAria": "Действия",
    "mobile.weaponAria": "Оружие",
    "mobile.serviceAria": "Сервис",
    "mobile.jump": "Прыжок",
  },
} as const satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof (typeof ui)["en"];

export interface SceneCopy {
  readonly status: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly ready: string;
  readonly loading: string;
  readonly description: string;
  readonly enter: string;
  readonly returnToGame: string;
  readonly reset: string;
}

// Per-scene HUD copy, keyed by the scene id. In-world signs stay in the scene
// files; this is the overlay text only.
export const sceneCopy: Record<string, Record<Language, SceneCopy>> = {
  "open-house": {
    en: {
      status: "Make a Mess / 004",
      eyebrow: "Open house test 001",
      heading: "The house is the toy.",
      ready: "Open house ready",
      loading: "Assembling the block…",
      description:
        "A whole neighbourhood: six four-storey blocks, three houses, streets and crossings, garages with doors that swing open, playgrounds and yards. On a computer — WASD and the mouse. On a phone or tablet — the left stick, a look zone on the right, and big weapon buttons.",
      enter: "Grab the hammer",
      returnToGame: "Back to the garage",
      reset: "Rebuild the block",
    },
    es: {
      status: "Make a Mess / 004",
      eyebrow: "Prueba de barrio 001",
      heading: "La casa es el juguete.",
      ready: "Barrio listo",
      loading: "Levantando el barrio…",
      description:
        "Un barrio entero: seis bloques de cuatro plantas, tres casas, calles con cruces, garajes con puertas que se abren, parques infantiles y patios. En ordenador: WASD y ratón. En móvil o tablet: joystick a la izquierda, zona de cámara a la derecha y botones de armas grandes.",
      enter: "Coger el martillo",
      returnToGame: "Volver al garaje",
      reset: "Reconstruir el barrio",
    },
    ru: {
      status: "Make a Mess / 004",
      eyebrow: "Open house test 001",
      heading: "Дом — объект.",
      ready: "Open house ready",
      loading: "Собираем дом…",
      description:
        "Целый квартал: шесть панельных четырёхэтажек, три дома, улицы с перекрёстками, гаражи с распахивающимися воротами, детские площадки и дворы. На компьютере — WASD и мышь. На телефоне или планшете — левый стик, правая зона обзора и крупные кнопки оружия.",
      enter: "Взять молоток",
      returnToGame: "Вернуться в гараж",
      reset: "Собрать дом заново",
    },
  },
  "minas-tirith": {
    en: {
      status: "Make a Mess / Minas Tirith",
      eyebrow: "Citadel breach test 001",
      heading: "The fortress is the toy.",
      ready: "The mountain gate is ready",
      loading: "Raising the fortress…",
      description:
        "A mountain ridge, a dark medieval wall with a gate, and a many-tiered tower behind it. Stone, basalt, wood, steel and dark glass stand on real supports and break with the same engine. On a computer — WASD and the mouse; on a phone or tablet — the stick and a look zone.",
      enter: "Head for the gate",
      returnToGame: "Resume the siege",
      reset: "Raise the fortress again",
    },
    es: {
      status: "Make a Mess / Minas Tirith",
      eyebrow: "Prueba de asalto a la ciudadela 001",
      heading: "La fortaleza es el juguete.",
      ready: "La puerta de la montaña está lista",
      loading: "Levantando la fortaleza…",
      description:
        "Una cordillera, una muralla medieval oscura con su puerta y una torre de muchos niveles detrás. Piedra, basalto, madera, acero y vidrio oscuro se sostienen sobre apoyos reales y se rompen con el mismo motor. En ordenador: WASD y ratón; en móvil o tablet: joystick y zona de cámara.",
      enter: "Ir hacia la puerta",
      returnToGame: "Seguir el asedio",
      reset: "Levantar la fortaleza de nuevo",
    },
    ru: {
      status: "Make a Mess / Minas Tirith",
      eyebrow: "Citadel breach test 001",
      heading: "Крепость — объект.",
      ready: "The mountain gate is ready",
      loading: "Поднимаем крепость…",
      description:
        "Горная гряда, тёмная средневековая стена с воротами и многоэтажная башня за ней. Камень, базальт, дерево, сталь и тёмное стекло держатся на реальных опорах и ломаются тем же движком. На компьютере — WASD и мышь; на телефоне или планшете — стик и зона обзора.",
      enter: "Выйти к воротам",
      returnToGame: "Продолжить осаду",
      reset: "Поднять крепость заново",
    },
  },
  "grand-terminal": {
    en: {
      status: "Make a Mess / Grand Terminal",
      eyebrow: "Railway museum test 001",
      heading: "The station is the toy.",
      ready: "Grand Terminal is open",
      loading: "Bringing in the locomotives…",
      description:
        "A grand European railway museum: a monumental ticket hall, platforms under a glazed train shed, a steam locomotive, historic carriages, benches, a departures board, bicycles and luggage. Every arch, truss, rail and fitting obeys the one destruction engine.",
      enter: "Enter the station",
      returnToGame: "Back to the platform",
      reset: "Restore the terminal",
    },
    es: {
      status: "Make a Mess / Grand Terminal",
      eyebrow: "Prueba de museo ferroviario 001",
      heading: "La estación es el juguete.",
      ready: "Grand Terminal abierto",
      loading: "Metiendo las locomotoras…",
      description:
        "Un gran museo ferroviario europeo: una monumental sala de billetes, andenes bajo una marquesina acristalada, una locomotora de vapor, vagones históricos, bancos, un panel de salidas, bicicletas y equipaje. Cada arco, cercha, raíl y detalle obedece al mismo motor de destrucción.",
      enter: "Entrar en la estación",
      returnToGame: "Volver al andén",
      reset: "Restaurar la terminal",
    },
    ru: {
      status: "Make a Mess / Grand Terminal",
      eyebrow: "Railway museum test 001",
      heading: "Вокзал — объект.",
      ready: "Grand Terminal is open",
      loading: "Подаём паровозы…",
      description:
        "Большой европейский железнодорожный музей: монументальный кассовый зал, платформы под стеклянным дебаркадером, паровоз, исторические вагоны, скамейки, табло, велосипеды и багаж. Каждая арка, ферма, рельс и деталь подчиняется общему движку разрушения.",
      enter: "Войти на вокзал",
      returnToGame: "Вернуться на платформу",
      reset: "Восстановить терминал",
    },
  },
  "viking-village": {
    en: {
      status: "Make a Mess / Viking Village",
      eyebrow: "North settlement test 001",
      heading: "The village is the toy.",
      ready: "The village is awake",
      loading: "Lighting the hearths…",
      description:
        "An inhabited northern settlement inside an uneven palisade: a jarl's great hall, log houses, muddy paths, weapon shelters, shields, laundry, ale barrels, torches, wet stone, moss and fungi. It is the first map compiled from reusable, editor-ready objects into the same destruction engine.",
      enter: "Enter through the gate",
      returnToGame: "Back to the village",
      reset: "Rebuild the settlement",
    },
    es: {
      status: "Make a Mess / Viking Village",
      eyebrow: "Prueba de poblado nórdico 001",
      heading: "La aldea es el juguete.",
      ready: "La aldea está despierta",
      loading: "Encendiendo los hogares…",
      description:
        "Un poblado nórdico habitado dentro de una empalizada irregular: gran salón del jarl, casas de troncos, caminos de barro, cobertizos de armas, escudos, ropa tendida, barriles, antorchas, piedra húmeda, musgo y hongos. Es el primer mapa compilado desde objetos reutilizables y preparados para un editor.",
      enter: "Entrar por la puerta",
      returnToGame: "Volver a la aldea",
      reset: "Reconstruir el poblado",
    },
    ru: {
      status: "Make a Mess / Viking Village",
      eyebrow: "North settlement test 001",
      heading: "Деревня — объект.",
      ready: "Деревня проснулась",
      loading: "Разжигаем очаги…",
      description:
        "Обитаемая северная деревня внутри неровного частокола: большой зал конунга, бревенчатые дома, грязные тропы, оружейные навесы, щиты, бельё, бочки, факелы, влажный камень, мох и грибы. Это первая карта, собранная из переиспользуемых, готовых к редактору объектов и скомпилированная в общий движок разрушения.",
      enter: "Войти через ворота",
      returnToGame: "Вернуться в деревню",
      reset: "Отстроить поселение заново",
    },
  },
};

export interface GameCardCopy {
  readonly stageLabel: string;
  readonly genre: string;
  readonly summary: string;
}

// Catalogue copy per game slug — the marketing text on the cards. Titles stay
// as they are (the game's name is not translated).
export const gameCardCopy: Record<string, Record<Language, GameCardCopy>> = {
  "make-a-mess": {
    en: {
      stageLabel: "Building the core",
      genre: "Destruction sandbox",
      summary:
        "A destruction sandbox about materials, supports and the joy of a well-made mess.",
    },
    es: {
      stageLabel: "Montando el núcleo",
      genre: "Sandbox de destrucción",
      summary:
        "Un sandbox de destrucción sobre materiales, apoyos y el placer de un buen desastre.",
    },
    ru: {
      stageLabel: "Собираем ядро",
      genre: "Destruction sandbox",
      summary:
        "Разрушаемая песочница про материалы, опоры и радость хорошо устроенного беспорядка.",
    },
  },
  "make-a-mess-minas-tirith": {
    en: {
      stageLabel: "New map",
      genre: "Siege sandbox",
      summary:
        "A mountain fortress with a dark wall, a gate and a many-tiered tower — all on the same one destruction engine.",
    },
    es: {
      stageLabel: "Mapa nuevo",
      genre: "Sandbox de asedio",
      summary:
        "Una fortaleza de montaña con muralla oscura, puerta y una torre de varios niveles — todo sobre el mismo motor de destrucción.",
    },
    ru: {
      stageLabel: "Новая карта",
      genre: "Siege sandbox",
      summary:
        "Горная крепость с тёмной стеной, воротами и многоэтажной башней — всё на том же едином движке разрушения.",
    },
  },
  "make-a-mess-grand-terminal": {
    en: {
      stageLabel: "Third map",
      genre: "Railway destruction sandbox",
      summary:
        "A European railway museum: a grand station, a glazed train shed, platforms, steam locomotives, carriages and a ticket hall.",
    },
    es: {
      stageLabel: "Tercer mapa",
      genre: "Sandbox ferroviario de destrucción",
      summary:
        "Un museo ferroviario europeo: una gran estación, una marquesina acristalada, andenes, locomotoras de vapor, vagones y una sala de billetes.",
    },
    ru: {
      stageLabel: "Третья карта",
      genre: "Railway destruction sandbox",
      summary:
        "Европейский железнодорожный музей: большой вокзал, стеклянный дебаркадер, платформы, паровозы, вагоны и кассовый зал.",
    },
  },
  "make-a-mess-viking-village": {
    en: {
      stageLabel: "New-model pilot",
      genre: "Living-world destruction sandbox",
      summary:
        "An inhabited northern village: palisade, longhouses, a jarl's hall, weapon shelters, laundry, hearths, mud, moss and rocky woodland.",
    },
    es: {
      stageLabel: "Piloto del nuevo modelo",
      genre: "Sandbox de mundo vivo y destrucción",
      summary:
        "Una aldea nórdica habitada: empalizada, casas largas, salón del jarl, cobertizos de armas, ropa tendida, hogares, barro, musgo y bosque rocoso.",
    },
    ru: {
      stageLabel: "Пилот новой модели",
      genre: "Living-world destruction sandbox",
      summary:
        "Обитаемая северная деревня: частокол, длинные дома, зал конунга, оружейные навесы, бельё, очаги, грязь, мох и каменистый лес.",
    },
  },
};
