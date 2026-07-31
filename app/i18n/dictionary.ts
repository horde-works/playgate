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
    "home.p3.body":
      "Good light, things you recognise, and physics with character.",
    "footer.place": "IGOR KIRISIUK · ASTANA, KAZAKHSTAN · 2026",

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
    "gate.loadingKicker": "Hold on",
    "gate.loadingTitle": "We are putting the world together.",
    "announce.kicker": "Mode",
    "announce.flightOn": "You fly like a gull.",
    "announce.flightOff": "Boots back on the ground.",
    "announce.weaponNone": "Empty hands. Just look.",
    "announce.weaponHammer": "The sledgehammer is in your hands.",
    "announce.weaponLauncher": "The launcher is on your shoulder.",
    "announce.weaponRocket": "The rocket is armed.",
    "announce.weaponMg": "The machine gun is warm.",
    "announce.interIslandRulesKicker": "Flight rules",
    "announce.interIslandWeaponBlocked":
      "Weapons are not permitted on inter-island flights.",
    "announce.timeKicker": "Time of day",
    "announce.timeDawn": "The sky is still making up its mind.",
    "announce.timeMorning": "The day has found its stride.",
    "announce.timeDay": "Every flaw is now on display.",
    "announce.timeAfternoon": "The light is beginning to lean.",
    "announce.timeSunset": "This is getting suspiciously beautiful.",
    "announce.timeEvening": "The windows are warmer than the sky.",
    "announce.timeNight": "The lamps are in charge now.",
    "announce.timePredawn": "Even the lamps are waiting for morning.",
    "announce.telemetryKicker": "Telemetry",
    "announce.telemetryOn": "The ship has started talking.",
    "announce.telemetryOff": "The channel is quiet.",
    "announce.telemetryAutoOff": "The ship has nothing more to report.",
    "announce.telemetryUnavailable": "Nothing moving is on the air.",
    "announce.vehicleFailureKicker": "Vehicle failure",
    "announce.vehicleFailure.structureLost":
      "The load-bearing structure has failed.",
    "announce.vehicleFailure.invalidState":
      "The physical state has become invalid.",
    "announce.vehicleFailure.unsafeAltitude":
      "The vehicle has dropped below safe altitude.",
    "announce.vehicleFailure.criticalAttitude":
      "Pitch, roll or yaw rate is critical.",
    "announce.vehicleFailure.routeDivergence":
      "The vehicle has lost its route or approach line.",
    "announce.vehicleFailure.controlMismatch":
      "The actuators are not following flight commands.",
    "announce.vehicleFailure.stalled":
      "The vehicle has stopped progressing along its route.",
    "announce.vehicleFailure.goAroundLimit":
      "Every landing approach has failed.",
    "announce.vehicleFailure.correctionLimit":
      "The vehicle can no longer hold its route.",
    "announce.vehicleFailure.trimExhausted":
      "The trim weights are at their stops and the hull still hangs over.",
    "announce.vehicleFailure.dockingTimeout":
      "The vehicle did not settle at the berth in time.",
    "chip.flight": "Flight mode",
    "flightLock.label": "Flight locked",
    "flightLock.note": "The fortress is taken on foot first",
    "announce.flightLockedKicker": "Flight rules",
    "announce.flightLocked": "Not yet. Walk.",
    "announce.flightUnlocked": "The old code still works. Fly.",
    "hud.launchAria": "Launch the 3D scene",

    "telemetry.aria": "Movement telemetry",
    "telemetry.kicker": "Live telemetry",
    "telemetry.phase.attention": "Attention",
    "telemetry.phase.departure": "Departure",
    "telemetry.phase.cruise": "In flight",
    "telemetry.phase.approach": "Arriving",
    "telemetry.phase.inTransit": "In transit",
    "telemetry.phase.failed": "Failure",
    "telemetry.mode.intercepting": "Route correction",
    "telemetry.mode.stabilizing": "Stabilising",
    "telemetry.metric.groundSpeed": "Ground speed",
    "telemetry.metric.relativeAltitude": "Height over berth",
    "telemetry.metric.verticalSpeed": "Vertical speed",
    "telemetry.metric.heading": "Course",
    "telemetry.metric.pitch": "Pitch",
    "telemetry.metric.roll": "Roll",
    "telemetry.attitudeAria": "Aircraft attitude",
    "telemetry.impactAria": "External impulse on the hull",
    "telemetry.impactKick": "Kick",
    "telemetry.impactRotation": "Rotation",
    "telemetry.metric.propellerRevolutions": "Propeller revolutions",
    "telemetry.side.left": "L",
    "telemetry.side.right": "R",
    "telemetry.metric.trimCar": "Trim weights",
    "telemetry.metric.routeProgress": "Route",
    "telemetry.metric.distanceRemaining": "Remaining",

    "weapon.hammer": "Hammer",
    "weapon.launcher": "Grenade launcher",
    "weapon.launcher.short": "Grenade",
    "weapon.rocket": "Rocket launcher",
    "weapon.rocket.short": "Rocket",
    "weapon.mg": "Machine gun",

    "time.dawn": "Dawn",
    "time.morning": "Morning",
    "time.day": "Day",
    "time.afternoon": "Afternoon",
    "time.sunset": "Sunset",
    "time.evening": "Evening",
    "time.night": "Night",
    "time.predawn": "Before dawn",

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
    "controls.telemetry": "Telemetry",
    "controls.jump": "Jump",
    "controls.chooseAction": "Choose an action",
    "controls.reset": "Restart",

    "hint.destination.eyebrow": "Flight controls",
    "hint.destination.title": "Choose the next action.",
    "destination.town": "Fly to the town",
    "destination.vikingVillage": "Fly to Viking Village",
    "interIsland.enteringAirspace.astana": "Entering the Capital airspace…",
    "interIsland.enteringAirspace.basalt-stronghold":
      "Entering Basalt Stronghold airspace…",
    "interIsland.enteringAirspace.grand-terminal":
      "Entering Grand Terminal airspace…",
    "interIsland.enteringAirspace.town": "Entering the town airspace…",
    "interIsland.enteringAirspace.viking-village":
      "Entering the village airspace…",
    "interIsland.welcome.astana": "Welcome to the Capital",
    "interIsland.welcome.basalt-stronghold": "Welcome to Basalt Stronghold",
    "interIsland.welcome.grand-terminal": "Welcome to Grand Terminal",
    "interIsland.welcome.town": "Welcome to the Town",
    "interIsland.welcome.viking-village": "Welcome to Viking Village",
    "interIsland.departingFor.astana": "Departing for the Capital",
    "interIsland.departingFor.basalt-stronghold":
      "Departing for Basalt Stronghold",
    "interIsland.departingFor.grand-terminal": "Departing for Grand Terminal",
    "interIsland.departingFor.town": "Departing for the town",
    "interIsland.departingFor.viking-village": "Departing for Viking Village",
    "interIsland.approach.astana": "On approach · the Capital",
    "interIsland.approach.basalt-stronghold": "On approach · Basalt Stronghold",
    "interIsland.approach.grand-terminal": "On approach · Grand Terminal",
    "interIsland.approach.town": "On approach · the town",
    "interIsland.approach.viking-village": "On approach · Viking Village",
    "interIsland.transitEyebrow": "Inter-island flight",
    "interIsland.aboard": "The crew is flying. You are a passenger.",
    "hud.takeControl": "Click to take control",
    "hud.takeControlTouch": "Tap to take control",

    "hint.spawn.eyebrow": "First move",
    "hint.spawn.title": "Look around. Try every tool.",
    "hint.spawn.controls": "The complete control list is always on the right.",
    "hint.spawn.controlsTouch": "All controls are available on screen.",
    "hint.gate.eyebrow": "The old law",
    "hint.gate.title": "No stranger crosses unbidden.",
    "hint.gate.key": "Space",
    "hint.gate.action": "Demand entry",
    "hint.gate.actionTouch": "Open the gate",
    "hint.door.eyebrow": "At the threshold",
    "hint.door.title": "Warmth waits beyond the timber.",
    "hint.door.key": "Space",
    "hint.door.action": "Ask to enter",
    "hint.door.actionTouch": "Enter the house",
    "hint.townDoor.eyebrow": "House entrance",
    "hint.townDoor.title": "Come on in.",
    "hint.townDoor.key": "Space",
    "hint.townDoor.action": "Open the door",
    "hint.townDoor.actionTouch": "Open the door",

    "hint.ride.eyebrow": "Passenger circuit",
    "hint.ride.title": "The head coach is ready for a sightseeing run.",
    "hint.ride.key": "Space",
    "hint.ride.action": "Ride the circuit",
    "hint.ride.actionTouch": "Ride along",
    "hint.vikingRide.eyebrow": "Aboard the longship",
    "hint.vikingRide.title":
      "The uneven circuit around the island starts here.",
    "hint.vikingRide.key": "Space",
    "hint.vikingRide.action": "Fly around the island",
    "hint.vikingRide.actionTouch": "Start the voyage",
    "hint.townRide.eyebrow": "Aboard Airship 07",
    "hint.townRide.title":
      "The city sightseeing flight starts inside the gondola.",
    "hint.townRide.key": "Space",
    "hint.townRide.action": "Take the city tour",
    "hint.townRide.actionTouch": "Start the flight",

    "hint.seat.eyebrow": "Driver's bay",
    "hint.seat.title": "The best view is already waiting.",
    "hint.seat.key": "Space",
    "hint.seat.action": "Take the seat",
    "hint.seat.actionTouch": "Sit down",
    "hint.stand.eyebrow": "Passenger's seat",
    "hint.stand.title": "The aisle is right behind you.",
    "hint.stand.key": "Space",
    "hint.stand.action": "Stand up",
    "hint.stand.actionTouch": "Stand up",

    "hint.departure.eyebrow": "Terminal dispatch",
    "hint.departure.title":
      "The empty sky train is ready for an inspection circuit.",
    "hint.departure.key": "Space",
    "hint.departure.action": "Start the dispatch circuit",
    "hint.departure.actionTouch": "Start inspection",
    "hint.vikingDeparture.eyebrow": "Watch pier",
    "hint.vikingDeparture.title":
      "The empty longship can circle the island on watch.",
    "hint.vikingDeparture.key": "Space",
    "hint.vikingDeparture.action": "Send the longship on watch",
    "hint.vikingDeparture.actionTouch": "Start the watch",
    "hint.townDeparture.eyebrow": "Mooring mast",
    "hint.townDeparture.title":
      "The empty airship is ready for a city survey circuit.",
    "hint.townDeparture.key": "Space",
    "hint.townDeparture.action": "Dispatch Airship 07",
    "hint.townDeparture.actionTouch": "Start the survey",
    "hint.hexacopterDeparture.eyebrow": "Yard vertipad",
    "hint.hexacopterDeparture.title":
      "HX-6 can fly the island circuit with the cabin empty.",
    "hint.hexacopterDeparture.key": "Space",
    "hint.hexacopterDeparture.action": "Send HX-6 around the island",
    "hint.hexacopterDeparture.actionTouch": "Send it up",
    "hint.hexacopterRide.eyebrow": "Inside HX-6",
    "hint.hexacopterRide.title":
      "One seat, six ducted rotors, and the whole island below.",
    "hint.hexacopterRide.key": "Space",
    "hint.hexacopterRide.action": "Fly the island circuit",
    "hint.hexacopterRide.actionTouch": "Lift off",

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
    "home.p3.body":
      "Buena luz, objetos reconocibles y una física con carácter.",
    "footer.place": "IGOR KIRISIUK · ASTANA, KAZAKHSTAN · 2026",

    "catalog.eyebrow": "Catálogo",
    "catalog.title1": "Juegos pequeños.",
    "catalog.title2": "Grandes experimentos.",
    "catalog.lede":
      "Cada uno tiene su propio espacio, reglas y carácter. Solo comparten la página principal y las ganas de hacerlo bien.",
    "catalog.gridAria": "Juegos",
    "catalog.nextIndex": "Siguiente hueco",
    "catalog.nextTitle": "Vacío por ahora",
    "catalog.nextBody":
      "El próximo juego aparecerá aquí cuando tenga una idea.",
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
    "gate.loadingKicker": "Un momento",
    "gate.loadingTitle": "Estamos montando el mundo.",
    "announce.kicker": "Modo",
    "announce.flightOn": "Vuelas como una gaviota.",
    "announce.flightOff": "Las botas vuelven al suelo.",
    "announce.weaponNone": "Manos vacías. Solo mira.",
    "announce.weaponHammer": "El martillo está en tus manos.",
    "announce.weaponLauncher": "El lanzagranadas al hombro.",
    "announce.weaponRocket": "El cohete está listo.",
    "announce.weaponMg": "La ametralladora está caliente.",
    "announce.interIslandRulesKicker": "Normas de vuelo",
    "announce.interIslandWeaponBlocked":
      "No se permite usar armas en los vuelos entre islas.",
    "announce.timeKicker": "Hora del día",
    "announce.timeDawn": "El cielo todavía no se decide.",
    "announce.timeMorning": "El día ya ha tomado impulso.",
    "announce.timeDay": "Todos los defectos quedan a la vista.",
    "announce.timeAfternoon": "La luz empieza a inclinarse.",
    "announce.timeSunset": "Esto se está poniendo sospechosamente bonito.",
    "announce.timeEvening": "Las ventanas ya son más cálidas que el cielo.",
    "announce.timeNight": "Ahora mandan las farolas.",
    "announce.timePredawn": "Hasta las farolas esperan la mañana.",
    "announce.telemetryKicker": "Telemetría",
    "announce.telemetryOn": "La nave se ha puesto a hablar.",
    "announce.telemetryOff": "El canal se queda en silencio.",
    "announce.telemetryAutoOff": "La nave ya no tiene nada que contar.",
    "announce.telemetryUnavailable": "No hay nada en movimiento en el aire.",
    "announce.vehicleFailureKicker": "Fallo del vehículo",
    "announce.vehicleFailure.structureLost":
      "La estructura portante ha fallado.",
    "announce.vehicleFailure.invalidState":
      "El estado físico ha dejado de ser válido.",
    "announce.vehicleFailure.unsafeAltitude":
      "El vehículo ha bajado de la altitud segura.",
    "announce.vehicleFailure.criticalAttitude":
      "El cabeceo, alabeo o guiñada es crítico.",
    "announce.vehicleFailure.routeDivergence":
      "El vehículo ha perdido la ruta o la senda de aproximación.",
    "announce.vehicleFailure.controlMismatch":
      "Los actuadores no responden a las órdenes de vuelo.",
    "announce.vehicleFailure.stalled":
      "El vehículo ha dejado de avanzar por la ruta.",
    "announce.vehicleFailure.goAroundLimit":
      "Han fallado todas las aproximaciones de aterrizaje.",
    "announce.vehicleFailure.correctionLimit":
      "El vehículo ya no puede mantener su ruta.",
    "announce.vehicleFailure.trimExhausted":
      "Los lastres móviles llegaron al tope y el casco sigue inclinado.",
    "announce.vehicleFailure.dockingTimeout":
      "El vehículo no se estabilizó a tiempo en el andén.",
    "chip.flight": "Modo vuelo",
    "flightLock.label": "Vuelo bloqueado",
    "flightLock.note": "La fortaleza se toma primero a pie",
    "announce.flightLockedKicker": "Reglas de vuelo",
    "announce.flightLocked": "Todavía no. Camina.",
    "announce.flightUnlocked": "El viejo código sigue funcionando. Vuela.",
    "hud.launchAria": "Iniciar la escena 3D",

    "telemetry.aria": "Telemetría de movimiento",
    "telemetry.kicker": "Telemetría en directo",
    "telemetry.phase.attention": "Atención",
    "telemetry.phase.departure": "Salida",
    "telemetry.phase.cruise": "En vuelo",
    "telemetry.phase.approach": "Llegando",
    "telemetry.phase.inTransit": "En tránsito",
    "telemetry.phase.failed": "Fallo",
    "telemetry.mode.intercepting": "Corrección de ruta",
    "telemetry.mode.stabilizing": "Estabilización",
    "telemetry.metric.groundSpeed": "Velocidad",
    "telemetry.metric.relativeAltitude": "Altura sobre andén",
    "telemetry.metric.verticalSpeed": "Velocidad vertical",
    "telemetry.metric.heading": "Rumbo",
    "telemetry.metric.pitch": "Cabeceo",
    "telemetry.metric.roll": "Alabeo",
    "telemetry.attitudeAria": "Actitud de la aeronave",
    "telemetry.impactAria": "Impulso externo sobre el casco",
    "telemetry.impactKick": "Golpe",
    "telemetry.impactRotation": "Giro",
    "telemetry.metric.propellerRevolutions": "Revoluciones de hélice",
    "telemetry.side.left": "I",
    "telemetry.side.right": "D",
    "telemetry.metric.trimCar": "Lastres móviles",
    "telemetry.metric.routeProgress": "Ruta",
    "telemetry.metric.distanceRemaining": "Restante",

    "weapon.hammer": "Martillo",
    "weapon.launcher": "Lanzagranadas",
    "weapon.launcher.short": "Granada",
    "weapon.rocket": "Lanzacohetes",
    "weapon.rocket.short": "Cohete",
    "weapon.mg": "Ametralladora",

    "time.dawn": "Amanecer",
    "time.morning": "Mañana",
    "time.day": "Día",
    "time.afternoon": "Tarde",
    "time.sunset": "Atardecer",
    "time.evening": "Anochecer",
    "time.night": "Noche",
    "time.predawn": "Madrugada",

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
    "controls.telemetry": "Telemetría",
    "controls.jump": "Saltar",
    "controls.chooseAction": "Elegir una acción",
    "controls.reset": "Reiniciar",

    "hint.destination.eyebrow": "Controles de vuelo",
    "hint.destination.title": "Elige la siguiente acción.",
    "destination.town": "Volar a la ciudad",
    "destination.vikingVillage": "Volar a la aldea vikinga",
    "interIsland.enteringAirspace.astana":
      "Entrando en el espacio aéreo de la Capital…",
    "interIsland.enteringAirspace.basalt-stronghold":
      "Entrando en el espacio aéreo de la Fortaleza de Basalto…",
    "interIsland.enteringAirspace.grand-terminal":
      "Entrando en el espacio aéreo de la Gran Terminal…",
    "interIsland.enteringAirspace.town":
      "Entrando en el espacio aéreo de la ciudad…",
    "interIsland.enteringAirspace.viking-village":
      "Entrando en el espacio aéreo de la aldea vikinga…",
    "interIsland.welcome.astana": "Bienvenido a la Capital",
    "interIsland.welcome.basalt-stronghold":
      "Bienvenido a la Fortaleza de Basalto",
    "interIsland.welcome.grand-terminal": "Bienvenido a la Gran Terminal",
    "interIsland.welcome.town": "Bienvenido a la ciudad",
    "interIsland.welcome.viking-village": "Bienvenido a la aldea vikinga",
    "interIsland.departingFor.astana": "Partimos hacia la Capital",
    "interIsland.departingFor.basalt-stronghold":
      "Partimos hacia la Fortaleza de Basalto",
    "interIsland.departingFor.grand-terminal":
      "Partimos hacia la Gran Terminal",
    "interIsland.departingFor.town": "Partimos hacia la ciudad",
    "interIsland.departingFor.viking-village":
      "Partimos hacia la aldea vikinga",
    "interIsland.approach.astana": "En aproximación · la Capital",
    "interIsland.approach.basalt-stronghold":
      "En aproximación · Fortaleza de Basalto",
    "interIsland.approach.grand-terminal": "En aproximación · Gran Terminal",
    "interIsland.approach.town": "En aproximación · la ciudad",
    "interIsland.approach.viking-village": "En aproximación · aldea vikinga",
    "interIsland.transitEyebrow": "Vuelo entre islas",
    "interIsland.aboard": "La tripulación vuela. Tú viajas de pasajero.",
    "hud.takeControl": "Haz clic para tomar el control",
    "hud.takeControlTouch": "Toca para tomar el control",

    "hint.spawn.eyebrow": "Primer paso",
    "hint.spawn.title": "Mira a tu alrededor. Prueba todas las herramientas.",
    "hint.spawn.controls":
      "La lista completa de controles está siempre a la derecha.",
    "hint.spawn.controlsTouch":
      "Todos los controles están disponibles en pantalla.",
    "hint.gate.eyebrow": "La antigua ley",
    "hint.gate.title": "Ningún extraño cruza sin ser llamado.",
    "hint.gate.key": "Espacio",
    "hint.gate.action": "Exigir el paso",
    "hint.gate.actionTouch": "Abrir la puerta",
    "hint.door.eyebrow": "En el umbral",
    "hint.door.title": "El calor espera tras la madera.",
    "hint.door.key": "Espacio",
    "hint.door.action": "Pedir entrar",
    "hint.door.actionTouch": "Entrar en la casa",
    "hint.ride.eyebrow": "Circuito de pasajeros",
    "hint.ride.title":
      "El coche de cabeza está listo para el vuelo panorámico.",
    "hint.ride.key": "Espacio",
    "hint.ride.action": "Volar el circuito",
    "hint.ride.actionTouch": "Volar",
    "hint.vikingRide.eyebrow": "A bordo del drakkar",
    "hint.vikingRide.title":
      "Aquí empieza la vuelta irregular alrededor de la isla.",
    "hint.vikingRide.key": "Espacio",
    "hint.vikingRide.action": "Volar alrededor de la isla",
    "hint.vikingRide.actionTouch": "Iniciar el viaje",
    "hint.townRide.eyebrow": "A bordo del dirigible 07",
    "hint.townRide.title":
      "El vuelo panorámico de la ciudad empieza dentro de la góndola.",
    "hint.townRide.key": "Espacio",
    "hint.townRide.action": "Sobrevolar la ciudad",
    "hint.townRide.actionTouch": "Iniciar el vuelo",

    "hint.seat.eyebrow": "Cabina del conductor",
    "hint.seat.title": "La mejor vista ya te espera.",
    "hint.seat.key": "Espacio",
    "hint.seat.action": "Sentarse",
    "hint.seat.actionTouch": "Sentarse",
    "hint.stand.eyebrow": "Asiento del pasajero",
    "hint.stand.title": "El pasillo está justo detrás.",
    "hint.stand.key": "Espacio",
    "hint.stand.action": "Levantarse",
    "hint.stand.actionTouch": "Levantarse",

    "hint.departure.eyebrow": "Despacho de la terminal",
    "hint.departure.title":
      "El tren vacío está listo para su circuito de inspección.",
    "hint.departure.key": "Espacio",
    "hint.departure.action": "Iniciar el circuito de control",
    "hint.departure.actionTouch": "Iniciar inspección",
    "hint.vikingDeparture.eyebrow": "Muelle de vigilancia",
    "hint.vikingDeparture.title":
      "El drakkar vacío puede rodear la isla de guardia.",
    "hint.vikingDeparture.key": "Espacio",
    "hint.vikingDeparture.action": "Enviar el drakkar de guardia",
    "hint.vikingDeparture.actionTouch": "Iniciar la guardia",
    "hint.townDeparture.eyebrow": "Mástil de amarre",
    "hint.townDeparture.title":
      "El dirigible vacío está listo para inspeccionar la ciudad.",
    "hint.townDeparture.key": "Espacio",
    "hint.townDeparture.action": "Despachar el dirigible 07",
    "hint.townDeparture.actionTouch": "Iniciar inspección",
    "hint.hexacopterDeparture.eyebrow": "Vertipuerto del patio",
    "hint.hexacopterDeparture.title":
      "El HX-6 puede dar la vuelta a la isla con la cabina vacía.",
    "hint.hexacopterDeparture.key": "Espacio",
    "hint.hexacopterDeparture.action": "Enviar el HX-6 a la vuelta",
    "hint.hexacopterDeparture.actionTouch": "Despegar sin nadie",
    "hint.hexacopterRide.eyebrow": "Dentro del HX-6",
    "hint.hexacopterRide.title":
      "Una plaza, seis rotores carenados y toda la isla abajo.",
    "hint.hexacopterRide.key": "Espacio",
    "hint.hexacopterRide.action": "Volar alrededor de la isla",
    "hint.hexacopterRide.actionTouch": "Despegar",

    "hint.townDoor.eyebrow": "Entrada de la casa",
    "hint.townDoor.title": "Puedes pasar.",
    "hint.townDoor.key": "Espacio",
    "hint.townDoor.action": "Abrir la puerta",
    "hint.townDoor.actionTouch": "Abrir la puerta",

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
    "footer.place": "IGOR KIRISIUK · ASTANA, KAZAKHSTAN · 2026",

    "catalog.eyebrow": "Каталог",
    "catalog.title1": "Маленькие игры.",
    "catalog.title2": "Большие эксперименты.",
    "catalog.lede":
      "Каждая получает собственное пространство, правила и характер. Общими остаются только главная страница и желание сделать хорошо.",
    "catalog.gridAria": "Игры",
    "catalog.nextIndex": "Следующий слот",
    "catalog.nextTitle": "Пока пусто",
    "catalog.nextBody":
      "Здесь появится следующая игра, когда у неё появится идея.",
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
    "gate.loadingKicker": "Секунду",
    "gate.loadingTitle": "Собираем мир, стараемся.",
    "announce.kicker": "Режим",
    "announce.flightOn": "Летаете как чайка.",
    "announce.flightOff": "Снова на своих двоих.",
    "announce.weaponNone": "Руки пусты. Просто смотрите.",
    "announce.weaponHammer": "В руках кувалда.",
    "announce.weaponLauncher": "Гранатомёт на плече.",
    "announce.weaponRocket": "Ракета готова.",
    "announce.weaponMg": "Пулемёт разогрет.",
    "announce.interIslandRulesKicker": "Правила рейса",
    "announce.interIslandWeaponBlocked":
      "Оружие не разрешено использовать на межостровных рейсах.",
    "announce.timeKicker": "Время суток",
    "announce.timeDawn": "Небо ещё не определилось.",
    "announce.timeMorning": "День уже набрал ход.",
    "announce.timeDay": "Все недостатки на виду.",
    "announce.timeAfternoon": "Свет начинает клониться.",
    "announce.timeSunset": "Становится подозрительно красиво.",
    "announce.timeEvening": "Окна теперь теплее неба.",
    "announce.timeNight": "Теперь всё держится на фонарях.",
    "announce.timePredawn": "Даже фонари уже ждут утра.",
    "announce.telemetryKicker": "Телеметрия",
    "announce.telemetryOn": "Корабль вышел на связь.",
    "announce.telemetryOff": "Канал замолчал.",
    "announce.telemetryAutoOff": "Кораблю больше нечего докладывать.",
    "announce.telemetryUnavailable": "В эфире пока никто не движется.",
    "announce.vehicleFailureKicker": "Сбой корабля",
    "announce.vehicleFailure.structureLost": "Несущая конструкция разрушена.",
    "announce.vehicleFailure.invalidState":
      "Физическое состояние корабля стало некорректным.",
    "announce.vehicleFailure.unsafeAltitude":
      "Корабль ушёл ниже безопасной высоты.",
    "announce.vehicleFailure.criticalAttitude":
      "Критический тангаж, крен или скорость рыскания.",
    "announce.vehicleFailure.routeDivergence":
      "Корабль потерял маршрут или посадочный створ.",
    "announce.vehicleFailure.controlMismatch":
      "Движители не исполняют команды автоматики.",
    "announce.vehicleFailure.stalled":
      "Корабль перестал продвигаться по маршруту.",
    "announce.vehicleFailure.goAroundLimit":
      "Все заходы на посадку не удались.",
    "announce.vehicleFailure.correctionLimit":
      "Корабль больше не удерживает маршрут.",
    "announce.vehicleFailure.trimExhausted":
      "Грузы дифферентовки на упоре, корпус остался с креном.",
    "announce.vehicleFailure.dockingTimeout":
      "Корабль не успел стабилизироваться у причала.",
    "chip.flight": "Режим полёта",
    "flightLock.label": "Полёт закрыт",
    "flightLock.note": "Крепость сначала берут пешком",
    "announce.flightLockedKicker": "Правила полёта",
    "announce.flightLocked": "Ещё нет. Ногами.",
    "announce.flightUnlocked": "Старый код всё ещё работает. Лети.",
    "hud.launchAria": "Запуск трёхмерной сцены",

    "telemetry.aria": "Телеметрия движения",
    "telemetry.kicker": "Прямая телеметрия",
    "telemetry.phase.attention": "Внимание",
    "telemetry.phase.departure": "Отправление",
    "telemetry.phase.cruise": "В полёте",
    "telemetry.phase.approach": "Прибытие",
    "telemetry.phase.inTransit": "В пути",
    "telemetry.phase.failed": "Сбой",
    "telemetry.mode.intercepting": "Коррекция маршрута",
    "telemetry.mode.stabilizing": "Стабилизация",
    "telemetry.metric.groundSpeed": "Путевая скорость",
    "telemetry.metric.relativeAltitude": "Высота над перроном",
    "telemetry.metric.verticalSpeed": "Вертикальная скорость",
    "telemetry.metric.heading": "Курс",
    "telemetry.metric.pitch": "Тангаж",
    "telemetry.metric.roll": "Крен",
    "telemetry.attitudeAria": "Положение корабля в пространстве",
    "telemetry.impactAria": "Внешний импульс по корпусу",
    "telemetry.impactKick": "Толчок",
    "telemetry.impactRotation": "Вращение",
    "telemetry.metric.propellerRevolutions": "Обороты винтов",
    "telemetry.side.left": "Л",
    "telemetry.side.right": "П",
    "telemetry.metric.trimCar": "Грузы дифферентовки",
    "telemetry.metric.routeProgress": "Маршрут",
    "telemetry.metric.distanceRemaining": "Осталось",

    "weapon.hammer": "Молоток",
    "weapon.launcher": "Гранатомёт",
    "weapon.launcher.short": "Граната",
    "weapon.rocket": "Ракетомёт",
    "weapon.rocket.short": "Ракета",
    "weapon.mg": "Пулемёт",

    "time.dawn": "Рассвет",
    "time.morning": "Утро",
    "time.day": "День",
    "time.afternoon": "После полудня",
    "time.sunset": "Закат",
    "time.evening": "Вечер",
    "time.night": "Ночь",
    "time.predawn": "Перед рассветом",

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
    "controls.telemetry": "Телеметрия",
    "controls.jump": "Прыжок",
    "controls.chooseAction": "Выбрать действие",
    "controls.reset": "Заново",

    "hint.destination.eyebrow": "Управление рейсом",
    "hint.destination.title": "Что делаем дальше?",
    "destination.town": "Лететь в город",
    "destination.vikingVillage": "Лететь в деревню",
    "interIsland.enteringAirspace.astana":
      "Входим в воздушное пространство Столицы…",
    "interIsland.enteringAirspace.basalt-stronghold":
      "Входим в воздушное пространство Базальтовой крепости…",
    "interIsland.enteringAirspace.grand-terminal":
      "Входим в воздушное пространство Большого вокзала…",
    "interIsland.enteringAirspace.town":
      "Входим в воздушное пространство города…",
    "interIsland.enteringAirspace.viking-village":
      "Входим в воздушное пространство деревни викингов…",
    "interIsland.welcome.astana": "Добро пожаловать в Столицу",
    "interIsland.welcome.basalt-stronghold":
      "Добро пожаловать в Базальтовую крепость",
    "interIsland.welcome.grand-terminal": "Добро пожаловать на Большой вокзал",
    "interIsland.welcome.town": "Добро пожаловать в город",
    "interIsland.welcome.viking-village": "Добро пожаловать в деревню викингов",
    "interIsland.departingFor.astana": "Уходим на Столицу",
    "interIsland.departingFor.basalt-stronghold":
      "Уходим на Базальтовую крепость",
    "interIsland.departingFor.grand-terminal": "Уходим на Большой вокзал",
    "interIsland.departingFor.town": "Уходим на город",
    "interIsland.departingFor.viking-village": "Уходим на деревню викингов",
    "interIsland.approach.astana": "Заходим на швартовку · Столица",
    "interIsland.approach.basalt-stronghold":
      "Заходим на швартовку · Базальтовая крепость",
    "interIsland.approach.grand-terminal":
      "Заходим на швартовку · Большой вокзал",
    "interIsland.approach.town": "Заходим на швартовку · город",
    "interIsland.approach.viking-village":
      "Заходим на швартовку · деревня викингов",
    "interIsland.transitEyebrow": "Межостровной рейс",
    "interIsland.aboard": "Ведёт команда. Ты пассажир.",
    "hud.takeControl": "Кликните, чтобы взять управление",
    "hud.takeControlTouch": "Коснитесь, чтобы взять управление",

    "hint.spawn.eyebrow": "Первый шаг",
    "hint.spawn.title": "Осмотрись. Попробуй весь инвентарь.",
    "hint.spawn.controls": "Полный список кнопок управления — справа.",
    "hint.spawn.controlsTouch": "Все кнопки управления уже на экране.",
    "hint.gate.eyebrow": "Старый закон",
    "hint.gate.title": "Незваным ворота не уступают.",
    "hint.gate.key": "Пробел",
    "hint.gate.action": "Потребовать прохода",
    "hint.gate.actionTouch": "Открыть ворота",
    "hint.door.eyebrow": "У порога",
    "hint.door.title": "За деревянной дверью ждёт тепло.",
    "hint.door.key": "Пробел",
    "hint.door.action": "Попроситься войти",
    "hint.door.actionTouch": "Войти в дом",
    "hint.townDoor.eyebrow": "Вход в дом",
    "hint.townDoor.title": "Можно заходить.",
    "hint.townDoor.key": "Пробел",
    "hint.townDoor.action": "Открыть дверь",
    "hint.townDoor.actionTouch": "Открыть дверь",

    "hint.ride.eyebrow": "Пассажирский круг",
    "hint.ride.title": "Головной вагон готов к обзорному рейсу.",
    "hint.ride.key": "Пробел",
    "hint.ride.action": "Отправиться в облёт",
    "hint.ride.actionTouch": "Поехать",
    "hint.vikingRide.eyebrow": "На борту драккара",
    "hint.vikingRide.title": "Отсюда начинается неровный круг вокруг острова.",
    "hint.vikingRide.key": "Пробел",
    "hint.vikingRide.action": "Облететь остров",
    "hint.vikingRide.actionTouch": "Начать путешествие",
    "hint.townRide.eyebrow": "На борту дирижабля",
    "hint.townRide.title": "Городской обзорный рейс начинается внутри гондолы.",
    "hint.townRide.key": "Пробел",
    "hint.townRide.action": "Облететь город",
    "hint.townRide.actionTouch": "Начать полёт",

    "hint.seat.eyebrow": "Кабина водителя",
    "hint.seat.title": "Лучшее место уже свободно.",
    "hint.seat.key": "Пробел",
    "hint.seat.action": "Сесть в кресло",
    "hint.seat.actionTouch": "Сесть",
    "hint.stand.eyebrow": "Пассажирское место",
    "hint.stand.title": "Вагон прямо за спиной.",
    "hint.stand.key": "Пробел",
    "hint.stand.action": "Встать",
    "hint.stand.actionTouch": "Встать",

    "hint.departure.eyebrow": "Диспетчерская Терминала",
    "hint.departure.title": "Пустой состав готов к контрольному кругу.",
    "hint.departure.key": "Пробел",
    "hint.departure.action": "Запустить диспетчерский облёт",
    "hint.departure.actionTouch": "Начать облёт",
    "hint.vikingDeparture.eyebrow": "Дозорный причал",
    "hint.vikingDeparture.title":
      "Пустой драккар может облететь остров дозором.",
    "hint.vikingDeparture.key": "Пробел",
    "hint.vikingDeparture.action": "Отправить драккар в дозор",
    "hint.vikingDeparture.actionTouch": "Начать дозор",
    "hint.townDeparture.eyebrow": "Причальная мачта",
    "hint.townDeparture.title":
      "Пустой дирижабль готов к контрольному облёту города.",
    "hint.townDeparture.key": "Пробел",
    "hint.townDeparture.action": "Отправить дирижабль в облёт",
    "hint.townDeparture.actionTouch": "Начать облёт",
    "hint.hexacopterDeparture.eyebrow": "Площадка во дворе",
    "hint.hexacopterDeparture.title":
      "HX-6 может облететь остров с пустой кабиной.",
    "hint.hexacopterDeparture.key": "Пробел",
    "hint.hexacopterDeparture.action": "Отправить HX-6 в облёт",
    "hint.hexacopterDeparture.actionTouch": "Отправить пустым",
    "hint.hexacopterRide.eyebrow": "В кабине HX-6",
    "hint.hexacopterRide.title":
      "Одно место, шесть колец и весь остров внизу.",
    "hint.hexacopterRide.key": "Пробел",
    "hint.hexacopterRide.action": "Облететь остров",
    "hint.hexacopterRide.actionTouch": "Взлететь",

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
  readonly startTitle?: string;
  readonly description: string;
  readonly enter: string;
  readonly returnToGame: string;
  readonly reset: string;
}

// Per-scene HUD copy, keyed by the scene id. In-world signs stay in the scene
// files; this is the overlay text only.
export const sceneCopy: Record<string, Record<Language, SceneCopy>> = {
  astana: {
    en: {
      status: "Make a Mess / The Capital",
      eyebrow: "Heart of the Great Steppe",
      heading: "Where roads meet.",
      ready: "The Capital is awake",
      loading: "Tracing the roads…",
      startTitle: "Welcome to the Capital island.",
      description:
        "The heart of the Great Steppe. Here the ancient Silk Road meets the new one, East meets West, and memory meets the future. The island connects cultures, roads and worlds.",
      enter: "Enter the Capital",
      returnToGame: "Return to the island",
      reset: "Begin again",
    },
    es: {
      status: "Make a Mess / The Capital",
      eyebrow: "Corazón de la Gran Estepa",
      heading: "Donde se cruzan los caminos.",
      ready: "La Capital está despierta",
      loading: "Trazando los caminos…",
      startTitle: "Bienvenido a la isla Capital.",
      description:
        "El corazón de la Gran Estepa. Aquí la antigua Ruta de la Seda se encuentra con la nueva, Oriente con Occidente y la memoria con el futuro. La isla conecta culturas, caminos y mundos.",
      enter: "Entrar en la Capital",
      returnToGame: "Volver a la isla",
      reset: "Empezar de nuevo",
    },
    ru: {
      status: "Make a Mess / The Capital",
      eyebrow: "Сердце Великой степи",
      heading: "Место встречи дорог.",
      ready: "Столица не спит",
      loading: "Соединяем дороги…",
      startTitle: "Добро пожаловать на остров-столицу.",
      description:
        "Сердце Великой степи. Здесь древний Шёлковый путь встречается с новым, Восток — с Западом, память — с будущим. Остров соединяет культуры, дороги и миры.",
      enter: "Войти в Столицу",
      returnToGame: "Вернуться на остров",
      reset: "Начать заново",
    },
  },
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
  "basalt-stronghold": {
    en: {
      status: "Make a Mess / Basalt Stronghold",
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
      status: "Make a Mess / Basalt Stronghold",
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
      status: "Make a Mess / Basalt Stronghold",
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
  "make-a-mess-basalt-stronghold": {
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
