import type { ScenePrefabPieceDefinition } from "../scenes/sceneContract.ts";

/**
 * Стандартная мебель — собранная, а не «кубик-эскиз».
 *
 * Каждый предмет построен как настоящий: ножки стоят на полу и несут царги,
 * царги несут столешницу, шпон лежит ПОВЕРХ столешницы отдельными тонкими
 * кусками (bearsLoad: false) — молоток сбивает его пятнами, как шпатель.
 * Спинка стула растёт из задних ножек, рейки висят между стойками на боковом
 * креплении. Выбей ножку — предмет складывается по-настоящему.
 *
 * Бюджет: стул ~10, стол ~12-18, кровать ~15-21 деталей. Это «герои» комнат,
 * им позволено больше, чем ящикам из coreProps (1-8), но каждая деталь
 * обязана читаться с метра.
 *
 * Все билдеры возвращают детали в ЛОКАЛЬНЫХ координатах (origin — пол под
 * центром предмета), yaw поворачивает предмет целиком. Контактные боксы у
 * повёрнутых деталей выписаны явно, чтобы осевой структурный решатель видел
 * честную опору.
 */

export type FurniturePiece = ScenePrefabPieceDefinition;

export function rand(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function shade(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0))
    .toString(16)
    .padStart(6, "0")}`;
}

/** Поворот локальной точки [x, z] на yaw вокруг origin предмета. */
export function spinner(yaw: number) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return (x: number, z: number): readonly [number, number] => [
    cos * x + sin * z,
    -sin * x + cos * z,
  ];
}

export function selfContact(piece: FurniturePiece): FurniturePiece {
  if (piece.contactBoxes) {
    return piece;
  }
  // Контактный бокс — осевой: у повёрнутой детали берём её горизонтальный
  // AABB, иначе царги стола, развёрнутого на 90°, ищут ножки не там.
  const yaw = piece.rotation?.[1] ?? 0;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  return {
    ...piece,
    contactBoxes: [{
      position: piece.position,
      size: [
        piece.size[0] * cos + piece.size[2] * sin,
        piece.size[1],
        piece.size[0] * sin + piece.size[2] * cos,
      ],
    }],
  };
}

// ---------------------------------------------------------------------------
// Столы
// ---------------------------------------------------------------------------

/**
 * Старый столярный стол: точёные ножки из двух ступеней, царги по периметру,
 * Н-образная проножка и столешница, с которой пластами слезает тёмный шпон.
 */
export function propOldTable(options: {
  readonly scale?: number;
  readonly yaw?: number;
  readonly seed?: number;
} = {}): FurniturePiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const seed = options.seed ?? 1;
  const spin = spinner(yaw);
  const timber = "#93744e";
  const halfX = 0.5 * s;
  const halfZ = 0.34 * s;
  const topY = 0.74 * s;
  const pieces: FurniturePiece[] = [];

  for (const [index, [lx, lz]] of ([
    [-halfX + 0.06, -halfZ + 0.06],
    [halfX - 0.06, -halfZ + 0.06],
    [-halfX + 0.06, halfZ - 0.06],
    [halfX - 0.06, halfZ - 0.06],
  ] as const).entries()) {
    const [px, pz] = spin(lx, lz);
    // Нижняя суженная часть ножки несёт верхнюю утолщённую — «точёный»
    // силуэт с фото, собранный из двух ступеней.
    pieces.push(
      selfContact({
        id: `leg:${index}:lower`,
        material: "wood",
        shape: "plank",
        position: [px, 0.21 * s, pz],
        rotation: [0, yaw, 0],
        size: [0.055 * s, 0.42 * s, 0.055 * s],
        color: shade(timber, 0.82),
        weathering: 0.35,
      }),
      selfContact({
        id: `leg:${index}:upper`,
        material: "wood",
        shape: "plank",
        position: [px, 0.55 * s, pz],
        rotation: [0, yaw, 0],
        size: [0.085 * s, 0.26 * s, 0.085 * s],
        color: shade(timber, 0.9),
        carriesAttachments: true,
        weathering: 0.28,
      }),
    );
  }

  // Царги под столешницей по периметру.
  for (const [index, [cx, cz, sx, sz]] of ([
    [0, -halfZ + 0.06, (halfX - 0.06) * 2 - 0.1, 0.05],
    [0, halfZ - 0.06, (halfX - 0.06) * 2 - 0.1, 0.05],
    [-halfX + 0.06, 0, 0.05, (halfZ - 0.06) * 2 - 0.1],
    [halfX - 0.06, 0, 0.05, (halfZ - 0.06) * 2 - 0.1],
  ] as const).entries()) {
    const [px, pz] = spin(cx, cz);
    pieces.push(selfContact({
      id: `apron:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.6 * s, pz],
      rotation: [0, yaw, 0],
      size: [sx, 0.12 * s, sz],
      color: shade(timber, 0.86),
      bearsLoad: false,
      sideAttachmentReach: 0.16,
      weathering: 0.3,
    }));
  }

  // Н-проножка: две продольные перекладины и мостик между ними.
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(0, side * (halfZ - 0.06));
    pieces.push(selfContact({
      id: `stretcher:${side}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.17 * s, pz],
      rotation: [0, yaw, 0],
      size: [(halfX - 0.06) * 2 - 0.08, 0.045 * s, 0.045 * s],
      color: shade(timber, 0.78),
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.4,
    }));
  }
  pieces.push(selfContact({
    id: "stretcher:bridge",
    material: "wood",
    shape: "plank",
    position: [0, 0.17 * s, 0],
    rotation: [0, yaw, 0],
    size: [0.045 * s, 0.045 * s, (halfZ - 0.06) * 2 - 0.06],
    color: shade(timber, 0.76),
    bearsLoad: false,
    sideAttachmentReach: 0.35,
    weathering: 0.4,
  }));

  // Столешница-основа: светлое дерево, которое обнажилось из-под шпона.
  pieces.push(selfContact({
    id: "top",
    material: "wood",
    shape: "plank",
    position: [0, topY, 0],
    rotation: [0, yaw, 0],
    size: [halfX * 2 + 0.06, 0.045 * s, halfZ * 2 + 0.06],
    color: "#b1946a",
    carriesAttachments: true,
    weathering: 0.32,
  }));

  // Куски уцелевшего шпона: тёмные острова, сбиваются по одному.
  const veneers = 3 + Math.floor(rand(seed, 1) * 2);
  for (let index = 0; index < veneers; index += 1) {
    const w = (0.24 + rand(seed, 10 + index) * 0.3) * s;
    const d = (0.2 + rand(seed, 20 + index) * 0.22) * s;
    const lx = (rand(seed, 30 + index) - 0.5) * (halfX * 2 - w - 0.08);
    const lz = (rand(seed, 40 + index) - 0.5) * (halfZ * 2 - d - 0.08);
    const [px, pz] = spin(lx, lz);
    pieces.push(selfContact({
      id: `veneer:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, topY + 0.028 * s, pz],
      rotation: [0, yaw + (rand(seed, 50 + index) - 0.5) * 0.1, 0],
      size: [w, 0.012, d],
      color: index % 2 === 0 ? "#3b2e24" : "#4a3527",
      bearsLoad: false,
      weathering: 0.2,
    }));
  }
  return pieces;
}

/**
 * Письменный стол с двумя тумбами: корпуса несут столешницу, фасады ящиков
 * навешены на корпус, с крышки соскоблен тёмный лак — светлые залысины.
 */
export function propWriterDesk(options: {
  readonly scale?: number;
  readonly yaw?: number;
  readonly seed?: number;
} = {}): FurniturePiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const seed = options.seed ?? 3;
  const spin = spinner(yaw);
  const lacquer = "#54301f";
  const topY = 0.75 * s;
  const pieces: FurniturePiece[] = [];

  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * 0.42 * s, 0);
    pieces.push(selfContact({
      id: `pedestal:${side}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.36 * s, pz],
      rotation: [0, yaw, 0],
      size: [0.4 * s, 0.72 * s, 0.52 * s],
      color: shade(lacquer, 0.94),
      carriesAttachments: true,
      weathering: 0.3,
    }));
    // Три фасада ящиков с тёмными латунными пятнами ручек не мельчим:
    // сами фасады — навесные дощечки, слетают от удара.
    for (let drawer = 0; drawer < 3; drawer += 1) {
      const [dx, dz] = spin(side * 0.42 * s, 0.27 * s);
      pieces.push(selfContact({
        id: `drawer:${side}:${drawer}`,
        material: "wood",
        shape: "plank",
        position: [dx, (0.13 + drawer * 0.22) * s, dz],
        rotation: [0, yaw, 0],
        size: [0.34 * s, 0.18 * s, 0.025],
        color: shade(lacquer, 0.78 + drawer * 0.06),
        bearsLoad: false,
        sideAttachmentReach: 0.1,
        weathering: 0.26,
      }));
    }
  }

  // Задняя стенка ниши связывает тумбы. Ниже тумб в полтора раза — иначе
  // решатель не признаёт тумбу «стеной», на которую можно навеситься.
  {
    const [px, pz] = spin(0, -0.22 * s);
    pieces.push(selfContact({
      id: "modesty",
      material: "wood",
      shape: "plank",
      position: [px, 0.47 * s, pz],
      rotation: [0, yaw, 0],
      size: [0.44 * s, 0.46 * s, 0.03],
      color: shade(lacquer, 0.7),
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.3,
    }));
  }

  pieces.push(selfContact({
    id: "top",
    material: "wood",
    shape: "plank",
    position: [0, topY, 0],
    rotation: [0, yaw, 0],
    size: [1.28 * s, 0.05 * s, 0.62 * s],
    color: "#6b402a",
    carriesAttachments: true,
    weathering: 0.3,
  }));

  // Залысины соскобленного лака: светлое дерево проступает островами.
  for (let index = 0; index < 3; index += 1) {
    const w = (0.2 + rand(seed, 60 + index) * 0.34) * s;
    const d = (0.16 + rand(seed, 70 + index) * 0.2) * s;
    const [px, pz] = spin(
      (rand(seed, 80 + index) - 0.5) * (1.2 * s - w),
      (rand(seed, 90 + index) - 0.5) * (0.56 * s - d),
    );
    pieces.push(selfContact({
      id: `bare:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, topY + 0.03 * s, pz],
      rotation: [0, yaw + (rand(seed, 95 + index) - 0.5) * 0.12, 0],
      size: [w, 0.01, d],
      color: index === 0 ? "#c2a273" : "#b3925f",
      bearsLoad: false,
      weathering: 0.16,
    }));
  }
  return pieces;
}

/** Каменная плита на трёх пнях; мох на плиту и валун нанесёт биофильм. */
export function propStoneTable(options: {
  readonly yaw?: number;
  readonly boulder?: boolean;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const pieces: FurniturePiece[] = [];

  for (const [index, [lx, lz]] of ([
    [-0.52, -0.28],
    [0.5, -0.32],
    [0.05, 0.34],
  ] as const).entries()) {
    const [px, pz] = spin(lx, lz);
    pieces.push(selfContact({
      id: `stump:${index}`,
      material: "wood",
      shape: "cylinder",
      position: [px, 0.26, pz],
      size: [0.36, 0.52, 0.36],
      color: index % 2 === 0 ? "#6d5137" : "#63492f",
      carriesAttachments: true,
      weathering: 0.7,
    }));
  }

  // Плита из двух слоёв со сдвигом — неровный край мегалита, не паркетная доска.
  const [capX, capZ] = spin(0.14, -0.08);
  pieces.push(
    selfContact({
      id: "slab",
      material: "stone",
      shape: "stoneBlock",
      position: [0, 0.62, 0],
      rotation: [0, yaw, 0],
      size: [1.72, 0.2, 1.18],
      color: "#938874",
      weathering: 0.85,
    }),
    selfContact({
      id: "slab:cap",
      material: "stone",
      shape: "stoneBlock",
      position: [capX, 0.76, capZ],
      rotation: [0, yaw + 0.09, 0],
      size: [1.3, 0.1, 0.86],
      color: "#9b917f",
      bearsLoad: false,
      weathering: 0.9,
    }),
  );

  if (options.boulder ?? true) {
    const [bx, bz] = spin(-0.4, 1.05);
    pieces.push(
      selfContact({
        id: "boulder",
        material: "stone",
        shape: "stoneBlock",
        position: [bx, 0.22, bz],
        rotation: [0, yaw + 0.5, 0.06],
        size: [1.05, 0.46, 0.78],
        color: "#8f887a",
        weathering: 0.9,
      }),
      selfContact({
        id: "boulder:cap",
        material: "stone",
        shape: "stoneBlock",
        position: [bx + 0.08, 0.5, bz - 0.04],
        rotation: [0, yaw + 0.9, -0.05],
        size: [0.68, 0.18, 0.5],
        color: "#98917f",
        bearsLoad: false,
        weathering: 0.92,
      }),
    );
  }
  return pieces;
}

/** Верстак на А-ножках: толстая столешница, разведённые ноги, стальные тяги. */
export function propTrestleTable(options: {
  readonly scale?: number;
  readonly yaw?: number;
} = {}): FurniturePiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const timber = "#a97e4a";
  const splay = 0.22;
  const pieces: FurniturePiece[] = [];

  for (const endSide of [-1, 1] as const) {
    for (const legSide of [-1, 1] as const) {
      // Нога разведена наружу поперёк стола: наклон вокруг продольной оси,
      // после yaw порядок Эйлера [0, yaw, roll] сохраняет геометрию.
      const footX = endSide * 0.42 * s;
      const footZ = legSide * 0.36 * s;
      const midZ = legSide * 0.2 * s;
      const [px, pz] = spin(footX, (footZ + midZ) / 2);
      pieces.push({
        id: `leg:${endSide}:${legSide}`,
        material: "wood",
        shape: "plank",
        position: [px, 0.36 * s, pz],
        rotation: [legSide * splay, yaw, 0],
        size: [0.075 * s, 0.74 * s, 0.075 * s],
        color: shade(timber, 0.85),
        carriesAttachments: true,
        weathering: 0.35,
        contactBoxes: [
          { position: [px, 0.05, pz + (footZ - midZ) * 0.4], size: [0.1 * s, 0.1, 0.12 * s] },
          { position: [px, 0.68 * s, pz - (footZ - midZ) * 0.4], size: [0.1 * s, 0.1, 0.12 * s] },
        ],
      });
    }
    // Стальная тяга между парой ног.
    const [tx, tz] = spin(endSide * 0.42 * s, 0);
    pieces.push(selfContact({
      id: `brace:${endSide}`,
      material: "steel",
      shape: "steelSheet",
      position: [tx, 0.3 * s, tz],
      rotation: [0, yaw, 0],
      size: [0.05, 0.05, 0.5 * s],
      color: "#3a3d3e",
      bearsLoad: false,
      sideAttachmentReach: 0.18,
      weathering: 0.4,
    }));
  }

  pieces.push(selfContact({
    id: "top",
    material: "wood",
    shape: "plank",
    position: [0, 0.76 * s, 0],
    rotation: [0, yaw, 0],
    size: [1.1 * s, 0.07 * s, 0.6 * s],
    color: timber,
    carriesAttachments: true,
    weathering: 0.3,
  }));
  return pieces;
}

// ---------------------------------------------------------------------------
// Стулья
// ---------------------------------------------------------------------------

interface ChairFrameOptions {
  readonly yaw: number;
  readonly timber: string;
  readonly seatY: number;
  readonly backTop: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly wear: number;
}

/**
 * Общий каркас стула: передние ножки до сиденья, задние — цельные стойки до
 * верха спинки, сиденье на всех четырёх, проножки по низу. Спинку каждый
 * билдер наполняет по-своему.
 */
function chairFrame(options: ChairFrameOptions): FurniturePiece[] {
  const { yaw, timber, seatY, backTop, halfX, halfZ, wear } = options;
  const spin = spinner(yaw);
  const pieces: FurniturePiece[] = [];

  for (const side of [-1, 1] as const) {
    const [fx, fz] = spin(side * (halfX - 0.035), halfZ - 0.035);
    pieces.push(selfContact({
      id: `leg:front:${side}`,
      material: "wood",
      shape: "plank",
      position: [fx, seatY / 2, fz],
      rotation: [0, yaw, 0],
      size: [0.055, seatY, 0.055],
      color: shade(timber, 0.88),
      weathering: wear,
    }));
    const [bx, bz] = spin(side * (halfX - 0.035), -halfZ + 0.035);
    // Контакт стойки разбит на нижний и верхний боксы по линии сиденья:
    // сиденье «врезано» вокруг стойки и опирается на её нижнюю часть, а не
    // отвергается решателем как глубокое взаимопроникновение.
    pieces.push({
      id: `stile:${side}`,
      material: "wood",
      shape: "plank",
      position: [bx, backTop / 2, bz],
      rotation: [0, yaw, 0],
      size: [0.055, backTop, 0.06],
      color: shade(timber, 0.82),
      carriesAttachments: true,
      weathering: wear,
      contactBoxes: [
        { position: [bx, seatY / 2, bz], size: [0.055, seatY, 0.06] },
        {
          position: [bx, (seatY + backTop) / 2 + 0.025, bz],
          size: [0.055, backTop - seatY - 0.05, 0.06],
        },
      ],
    });
  }

  // Проножки: две боковые и передняя.
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * (halfX - 0.035), 0);
    pieces.push(selfContact({
      id: `rung:side:${side}`,
      material: "wood",
      shape: "plank",
      position: [px, seatY * 0.42, pz],
      rotation: [0, yaw, 0],
      size: [0.04, 0.04, halfZ * 2 - 0.12],
      color: shade(timber, 0.78),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: wear,
    }));
  }
  {
    const [px, pz] = spin(0, halfZ - 0.035);
    pieces.push(selfContact({
      id: "rung:front",
      material: "wood",
      shape: "plank",
      position: [px, seatY * 0.42, pz],
      rotation: [0, yaw, 0],
      size: [halfX * 2 - 0.12, 0.04, 0.04],
      color: shade(timber, 0.78),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: wear,
    }));
  }

  const [seatX, seatZ] = spin(0, 0.012);
  pieces.push(selfContact({
    id: "seat",
    material: "wood",
    shape: "plank",
    position: [seatX, seatY + 0.025, seatZ],
    rotation: [0, yaw, 0],
    size: [halfX * 2 + 0.03, 0.05, halfZ * 2 + 0.02],
    color: timber,
    carriesAttachments: true,
    weathering: wear,
  }));
  return pieces;
}

/** Стул с вертикальными рейками спинки и фигурным гребнем. */
export function propSlatChair(options: {
  readonly yaw?: number;
  readonly timber?: string;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const timber = options.timber ?? "#8a5a30";
  const spin = spinner(yaw);
  const seatY = 0.45;
  const backTop = 1.06;
  const halfZ = 0.235;
  const pieces = chairFrame({
    yaw, timber, seatY, backTop, halfX: 0.22, halfZ, wear: 0.3,
  });

  // Гребень поверх стоек и три рейки, висящие между гребнем и сиденьем.
  {
    const [px, pz] = spin(0, -halfZ + 0.035);
    pieces.push(selfContact({
      id: "crest",
      material: "wood",
      shape: "plank",
      position: [px, backTop + 0.045, pz],
      rotation: [0, yaw, 0],
      size: [0.5, 0.09, 0.05],
      color: shade(timber, 0.92),
      weathering: 0.3,
    }));
  }
  for (const slat of [-1, 0, 1] as const) {
    const [px, pz] = spin(slat * 0.115, -halfZ + 0.035);
    pieces.push(selfContact({
      id: `slat:${slat}`,
      material: "wood",
      shape: "plank",
      position: [px, (seatY + backTop) / 2 + 0.02, pz],
      rotation: [0, yaw, 0],
      size: [0.055, backTop - seatY - 0.06, 0.03],
      color: shade(timber, 1.04),
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.3,
    }));
  }
  return pieces;
}

/**
 * Советский стул с ободранным мягким сиденьем: две горизонтальные планки
 * спинки, поверх деревянного сиденья — лохмотья обивки, слетающие от удара.
 */
export function propWornChair(options: {
  readonly yaw?: number;
  readonly seed?: number;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const seed = options.seed ?? 5;
  const timber = "#5e4028";
  const spin = spinner(yaw);
  const seatY = 0.45;
  const backTop = 0.94;
  const halfZ = 0.225;
  const pieces = chairFrame({
    yaw, timber, seatY, backTop, halfX: 0.21, halfZ, wear: 0.42,
  });

  for (const [index, railY] of [backTop - 0.06, backTop - 0.2].entries()) {
    const [px, pz] = spin(0, -halfZ + 0.035);
    pieces.push(selfContact({
      id: `rail:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, railY, pz],
      rotation: [0, yaw, 0],
      size: [0.36, 0.07, 0.035],
      color: shade(timber, 0.92 + index * 0.06),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: 0.42,
    }));
  }

  // Остатки обивки: пёстрая тряпка со сбитым углом.
  const [cx, cz] = spin(
    (rand(seed, 1) - 0.5) * 0.06,
    (rand(seed, 2) - 0.5) * 0.05,
  );
  pieces.push(selfContact({
    id: "upholstery",
    material: "cloth",
    shape: "panel",
    position: [cx, seatY + 0.065, cz],
    rotation: [0, yaw + (rand(seed, 3) - 0.5) * 0.16, 0],
    size: [0.36, 0.035, 0.36],
    color: "#b9a58c",
    bearsLoad: false,
    weathering: 0.5,
  }));
  return pieces;
}

/** Чёрный конторский стул: рамка спинки с дерматиновой вставкой. */
export function propPanelChair(options: {
  readonly yaw?: number;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const timber = "#37302a";
  const spin = spinner(yaw);
  const seatY = 0.46;
  const backTop = 1.08;
  const halfZ = 0.23;
  const pieces = chairFrame({
    yaw, timber, seatY, backTop, halfX: 0.215, halfZ, wear: 0.35,
  });

  for (const [index, railY] of [backTop - 0.03, seatY + 0.14].entries()) {
    const [px, pz] = spin(0, -halfZ + 0.035);
    pieces.push(selfContact({
      id: `rail:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, railY, pz],
      rotation: [0, yaw, 0],
      size: [0.37, 0.07, 0.04],
      color: shade(timber, 1.08),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: 0.35,
    }));
  }
  // Дерматиновая вставка и такая же накладка на сиденье.
  {
    const [px, pz] = spin(0, -halfZ + 0.035);
    pieces.push(selfContact({
      id: "back:panel",
      material: "cloth",
      shape: "panel",
      position: [px, (seatY + backTop) / 2 + 0.06, pz],
      rotation: [0, yaw, 0],
      size: [0.3, backTop - seatY - 0.3, 0.028],
      color: "#26221f",
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: 0.3,
    }));
  }
  pieces.push(selfContact({
    id: "seat:pad",
    material: "cloth",
    shape: "panel",
    position: [0, seatY + 0.06, 0],
    rotation: [0, yaw, 0],
    size: [0.37, 0.03, 0.37],
    color: "#2b2724",
    bearsLoad: false,
    weathering: 0.3,
  }));
  return pieces;
}

// ---------------------------------------------------------------------------
// Кровати
// ---------------------------------------------------------------------------

/**
 * Железная кровать: точёные стойки с латунными шишками, спинки из прутьев,
 * продольные уголки рамы, матрас, одеяло и подушка.
 */
export function propIronBed(options: {
  readonly yaw?: number;
  readonly scale?: number;
} = {}): FurniturePiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const iron = "#33373a";
  const brass = "#8f7440";
  const halfX = 0.47 * s;
  const halfZ = 0.98 * s;
  const railY = 0.42 * s;
  const pieces: FurniturePiece[] = [];

  for (const endSide of [-1, 1] as const) {
    // Изголовье выше изножья, как у настоящей панцирной кровати.
    const headTop = (endSide < 0 ? 1.16 : 0.96) * s;
    const lz = endSide * halfZ;
    for (const side of [-1, 1] as const) {
      const [px, pz] = spin(side * halfX, lz);
      pieces.push(
        selfContact({
          id: `post:${endSide}:${side}`,
          material: "steel",
          shape: "cylinder",
          position: [px, headTop / 2, pz],
          rotation: [0, yaw, 0],
          size: [0.05 * s, headTop, 0.05 * s],
          color: iron,
          carriesAttachments: true,
          weathering: 0.38,
        }),
        selfContact({
          id: `knob:${endSide}:${side}`,
          material: "steel",
          shape: "cylinder",
          position: [px, headTop + 0.045 * s, pz],
          rotation: [0, yaw, 0],
          size: [0.085 * s, 0.09 * s, 0.085 * s],
          color: brass,
          bearsLoad: false,
          weathering: 0.3,
        }),
      );
    }
    // Верхняя латунная перекладина и четыре прута под ней.
    const barY = headTop - 0.09 * s;
    const [bx, bz] = spin(0, lz);
    pieces.push(selfContact({
      id: `topbar:${endSide}`,
      material: "steel",
      shape: "cylinder",
      position: [bx, barY, bz],
      rotation: [0, yaw, Math.PI / 2],
      size: [0.035 * s, halfX * 2 - 0.06, 0.035 * s],
      color: brass,
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.32,
      contactBoxes: [{
        position: [bx, barY, bz],
        size: [halfX * 2 - 0.06, 0.05, 0.08],
      }],
    }));
    for (const rod of [-1.5, -0.5, 0.5, 1.5] as const) {
      const [px, pz] = spin(rod * 0.19 * s, lz);
      pieces.push(selfContact({
        id: `rod:${endSide}:${rod}`,
        material: "steel",
        shape: "cylinder",
        position: [px, (railY + barY) / 2, pz],
        rotation: [0, yaw, 0],
        size: [0.018 * s, barY - railY - 0.03, 0.018 * s],
        color: iron,
        bearsLoad: false,
        sideAttachmentReach: 0.1,
        weathering: 0.38,
      }));
    }
  }

  // Продольные уголки рамы между стойками.
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * halfX, 0);
    pieces.push(selfContact({
      id: `rail:${side}`,
      material: "steel",
      shape: "steelSheet",
      position: [px, railY, pz],
      rotation: [0, yaw, 0],
      size: [0.05 * s, 0.09 * s, halfZ * 2 - 0.08],
      color: iron,
      sideAttachmentReach: 0.14,
      carriesAttachments: true,
      weathering: 0.4,
    }));
  }

  // Матрас лежит на уголках, одеяло и подушка — поверх.
  pieces.push(
    selfContact({
      id: "mattress",
      material: "cloth",
      shape: "panel",
      position: [0, railY + 0.12 * s, 0],
      rotation: [0, yaw, 0],
      size: [halfX * 2 + 0.02, 0.2 * s, halfZ * 2 - 0.12],
      color: "#8a8177",
      carriesAttachments: true,
      weathering: 0.2,
    }),
    selfContact({
      id: "blanket",
      material: "cloth",
      shape: "panel",
      position: [spin(0, 0.18 * s)[0], railY + 0.245 * s, spin(0, 0.18 * s)[1]],
      rotation: [0, yaw, 0],
      size: [halfX * 2 + 0.1, 0.05 * s, halfZ * 2 - 0.62],
      color: "#75695c",
      bearsLoad: false,
      weathering: 0.2,
    }),
    selfContact({
      id: "pillow",
      material: "cloth",
      shape: "panel",
      position: [spin(0, -halfZ + 0.32)[0], railY + 0.27 * s, spin(0, -halfZ + 0.32)[1]],
      rotation: [0, yaw + 0.06, 0],
      size: [0.52 * s, 0.1 * s, 0.36 * s],
      color: "#d9d2c2",
      bearsLoad: false,
      weathering: 0.12,
    }),
  );
  return pieces;
}

// ---------------------------------------------------------------------------
// Мягкая мебель
// ---------------------------------------------------------------------------

/** Ролл (валик) вдоль локальной оси X предмета с учётом yaw. */
function rollAlongX(yaw: number): readonly [number, number, number] {
  return [0, yaw, Math.PI / 2];
}

/** Ролл вдоль локальной оси Z предмета с учётом yaw. */
function rollAlongZ(yaw: number): readonly [number, number, number] {
  return [Math.PI / 2, 0, -yaw];
}

/**
 * Советский прямой диван: светлый каркас с прямыми подлокотниками, стёганый
 * матрас и две съёмные подушки спинки на деревянных ножках-шайбах.
 */
export function propSovietSofa(options: {
  readonly yaw?: number;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const frame = "#ddd4c1";
  const fabric = "#c3b193";
  const pieces: FurniturePiece[] = [];

  for (const [index, [lx, lz]] of ([
    [-0.85, -0.32],
    [0.85, -0.32],
    [-0.85, 0.32],
    [0.85, 0.32],
  ] as const).entries()) {
    const [px, pz] = spin(lx, lz);
    pieces.push(selfContact({
      id: `foot:${index}`,
      material: "wood",
      shape: "cylinder",
      position: [px, 0.045, pz],
      size: [0.08, 0.09, 0.08],
      color: "#6b5236",
      weathering: 0.3,
    }));
  }
  pieces.push(selfContact({
    id: "base",
    material: "plastic",
    shape: "panel",
    position: [0, 0.17, 0],
    rotation: [0, yaw, 0],
    size: [1.9, 0.16, 0.8],
    color: frame,
    carriesAttachments: true,
    weathering: 0.25,
  }));
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * 0.84, 0);
    pieces.push(selfContact({
      id: `arm:${side}`,
      material: "plastic",
      shape: "panel",
      position: [px, 0.5, pz],
      rotation: [0, yaw, 0],
      size: [0.22, 0.5, 0.8],
      color: shade(frame, 0.98),
      weathering: 0.25,
    }));
  }
  {
    const [px, pz] = spin(0, -0.33);
    pieces.push(selfContact({
      id: "back",
      material: "plastic",
      shape: "panel",
      position: [px, 0.52, pz],
      rotation: [0, yaw, 0],
      size: [1.46, 0.54, 0.14],
      color: shade(frame, 0.95),
      carriesAttachments: true,
      weathering: 0.25,
    }));
  }
  pieces.push(selfContact({
    id: "mattress",
    material: "cloth",
    shape: "panel",
    position: [spin(0, 0.06)[0], 0.33, spin(0, 0.06)[1]],
    rotation: [0, yaw, 0],
    size: [1.44, 0.16, 0.62],
    color: fabric,
    carriesAttachments: true,
    weathering: 0.25,
  }));
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * 0.36, -0.2);
    pieces.push(selfContact({
      id: `cushion:${side}`,
      material: "cloth",
      shape: "panel",
      position: [px, 0.6, pz],
      rotation: [0, yaw, 0],
      size: [0.7, 0.4, 0.16],
      color: shade(fabric, 1.04),
      bearsLoad: false,
      weathering: 0.25,
    }));
  }
  return pieces;
}

/**
 * Потёртый кожаный честерфилд: роллы подлокотников и спинки, латунные
 * ножки-шарики,潰шие подушки и рваные дыры с торчащей набивкой.
 */
export function propChesterfield(options: {
  readonly yaw?: number;
  readonly seed?: number;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const seed = options.seed ?? 7;
  const spin = spinner(yaw);
  const hide = "#67322a";
  const pieces: FurniturePiece[] = [];

  for (const [index, [lx, lz]] of ([
    [-0.72, -0.3],
    [0.72, -0.3],
    [-0.72, 0.3],
    [0.72, 0.3],
  ] as const).entries()) {
    const [px, pz] = spin(lx, lz);
    pieces.push(selfContact({
      id: `foot:${index}`,
      material: "wood",
      shape: "cylinder",
      position: [px, 0.05, pz],
      size: [0.1, 0.1, 0.1],
      color: "#4a3322",
      weathering: 0.3,
    }));
  }
  pieces.push(selfContact({
    id: "base",
    material: "plastic",
    shape: "panel",
    position: [0, 0.26, 0],
    rotation: [0, yaw, 0],
    size: [1.66, 0.32, 0.78],
    color: hide,
    carriesAttachments: true,
    weathering: 0.3,
  }));
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * 0.72, 0.02);
    pieces.push(
      selfContact({
        id: `arm:${side}`,
        material: "plastic",
        shape: "panel",
        position: [px, 0.52, pz],
        rotation: [0, yaw, 0],
        size: [0.22, 0.22, 0.72],
        color: hide,
        carriesAttachments: true,
        weathering: 0.3,
      }),
      selfContact({
        id: `armroll:${side}`,
        material: "plastic",
        shape: "cylinder",
        position: [px, 0.68, pz],
        rotation: rollAlongZ(yaw),
        size: [0.2, 0.68, 0.2],
        color: shade(hide, 1.06),
        bearsLoad: false,
        weathering: 0.3,
        contactBoxes: [{ position: [px, 0.68, pz], size: [0.2, 0.2, 0.68] }],
      }),
    );
  }
  {
    const [px, pz] = spin(0, -0.31);
    pieces.push(
      selfContact({
        id: "back",
        material: "plastic",
        shape: "panel",
        position: [px, 0.6, pz],
        rotation: [0, yaw, 0],
        size: [1.3, 0.36, 0.16],
        color: hide,
        carriesAttachments: true,
        weathering: 0.3,
      }),
      selfContact({
        id: "backroll",
        material: "plastic",
        shape: "cylinder",
        position: [px, 0.84, pz],
        rotation: rollAlongX(yaw),
        size: [0.17, 1.3, 0.17],
        color: shade(hide, 1.06),
        bearsLoad: false,
        weathering: 0.3,
        contactBoxes: [{ position: [px, 0.84, pz], size: [1.3, 0.17, 0.17] }],
      }),
    );
  }
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * 0.33, 0.09);
    pieces.push(selfContact({
      id: `cushion:${side}`,
      material: "cloth",
      shape: "panel",
      position: [px, 0.49, pz],
      rotation: [0, yaw, 0],
      size: [0.62, 0.14, 0.56],
      color: shade(hide, 1.12),
      bearsLoad: false,
      weathering: 0.35,
    }));
  }
  // Рваные дыры: светлая набивка торчит пятнами, каждое можно сбить.
  for (let hole = 0; hole < 3; hole += 1) {
    const w = 0.1 + rand(seed, 10 + hole) * 0.16;
    const lx = (rand(seed, 20 + hole) - 0.5) * 1.1;
    const onBack = hole === 2;
    const [px, pz] = spin(lx, onBack ? -0.29 + 0.09 : 0.09);
    pieces.push(selfContact({
      id: `tear:${hole}`,
      material: "cloth",
      shape: "panel",
      position: onBack
        ? [px, 0.66, spin(lx, -0.215)[1]]
        : [px, 0.57, pz],
      rotation: [0, yaw + (rand(seed, 30 + hole) - 0.5) * 0.4, 0],
      size: onBack ? [w, w * 0.8, 0.015] : [w, 0.015, w * 0.8],
      color: "#d9b96a",
      bearsLoad: false,
      weathering: 0.2,
    }));
  }
  return pieces;
}

/**
 * Общий строитель гарнитура 80-х: тёмный каркас, наклонные подлокотники и
 * рыжая спинка из вертикальных «каналов», выбиваемых по одному.
 */
function channelSeat(
  yaw: number,
  width: number,
  idPrefix: string,
): FurniturePiece[] {
  const spin = spinner(yaw);
  const frame = "#5b3a27";
  const wale = "#b57c46";
  const pieces: FurniturePiece[] = [];

  pieces.push(selfContact({
    id: `${idPrefix}base`,
    material: "plastic",
    shape: "panel",
    position: [0, 0.16, 0],
    rotation: [0, yaw, 0],
    size: [width, 0.32, 0.82],
    color: frame,
    carriesAttachments: true,
    weathering: 0.25,
  }));
  {
    const [px, pz] = spin(0, -0.32);
    pieces.push(selfContact({
      id: `${idPrefix}backframe`,
      material: "plastic",
      shape: "panel",
      position: [px, 0.56, pz],
      rotation: [0, yaw, 0],
      size: [width - 0.06, 0.52, 0.18],
      color: frame,
      carriesAttachments: true,
      weathering: 0.25,
    }));
  }
  // Наклонные «крылья» подлокотников.
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * (width / 2 + 0.09), 0.05);
    pieces.push(selfContact({
      id: `${idPrefix}arm:${side}`,
      material: "plastic",
      shape: "panel",
      position: [px, 0.42, pz],
      rotation: [0, yaw, side * 0.18],
      size: [0.2, 0.5, 0.7],
      color: frame,
      weathering: 0.25,
    }));
  }
  pieces.push(selfContact({
    id: `${idPrefix}seat`,
    material: "cloth",
    shape: "panel",
    position: [spin(0, 0.09)[0], 0.39, spin(0, 0.09)[1]],
    rotation: [0, yaw, 0],
    size: [width - 0.08, 0.14, 0.6],
    color: wale,
    bearsLoad: false,
    weathering: 0.28,
  }));
  // Вертикальные каналы спинки: стоят на цоколе, прислонены к каркасу.
  const channels = Math.max(3, Math.round((width - 0.1) / 0.15));
  const step = (width - 0.12) / channels;
  for (let channel = 0; channel < channels; channel += 1) {
    const lx = -(width - 0.12) / 2 + step * (channel + 0.5);
    const [px, pz] = spin(lx, -0.24);
    pieces.push(selfContact({
      id: `${idPrefix}wale:${channel}`,
      material: "cloth",
      shape: "panel",
      position: [px, 0.64, pz],
      rotation: [0, yaw, 0],
      size: [step - 0.015, 0.6, 0.13],
      color: channel % 2 === 0 ? wale : shade(wale, 1.05),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: 0.28,
    }));
  }
  return pieces;
}

/** Диван гарнитура 80-х: два тона, канальная спинка. */
export function propChannelSofa(options: {
  readonly yaw?: number;
} = {}): FurniturePiece[] {
  return channelSeat(options.yaw ?? 0, 1.7, "");
}

/** Кресло того же гарнитура. */
export function propChannelArmchair(options: {
  readonly yaw?: number;
} = {}): FurniturePiece[] {
  return channelSeat(options.yaw ?? 0, 0.78, "");
}

/**
 * Угловой диван 90-х: длинная и короткая секции, веерные подушки-«ракушки»
 * и лакированные деревянные вставки по фронту.
 */
export function propCornerSofa(options: {
  readonly yaw?: number;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const velour = "#988c78";
  const trim = "#a45f24";
  const pieces: FurniturePiece[] = [];

  // Длинная секция вдоль x, угловая уходит вглубь по z слева.
  const mainBase: readonly [number, number, number, number] = [0.35, 0, 2.1, 0.85];
  const wingBase: readonly [number, number, number, number] = [-0.93, 0.35, 0.66, 1.55];
  for (const [index, [bx, bz, bw, bd]] of [mainBase, wingBase].entries()) {
    const [px, pz] = spin(bx, bz);
    pieces.push(selfContact({
      id: `base:${index}`,
      material: "plastic",
      shape: "panel",
      position: [px, 0.19, pz],
      rotation: [0, yaw, 0],
      size: [bw, 0.38, bd],
      color: shade(velour, 0.94),
      carriesAttachments: true,
      weathering: 0.28,
    }));
  }
  // Сиденья.
  pieces.push(
    selfContact({
      id: "seat:main",
      material: "cloth",
      shape: "panel",
      position: [spin(0.42, 0.06)[0], 0.45, spin(0.42, 0.06)[1]],
      rotation: [0, yaw, 0],
      size: [1.9, 0.14, 0.66],
      color: velour,
      bearsLoad: false,
      weathering: 0.3,
    }),
    selfContact({
      id: "seat:wing",
      material: "cloth",
      shape: "panel",
      position: [spin(-0.9, 0.5)[0], 0.45, spin(-0.9, 0.5)[1]],
      rotation: [0, yaw, 0],
      size: [0.58, 0.14, 1.1],
      color: shade(velour, 1.03),
      bearsLoad: false,
      weathering: 0.3,
    }),
  );
  // Спинки-каркасы.
  pieces.push(
    selfContact({
      id: "back:main",
      material: "plastic",
      shape: "panel",
      position: [spin(0.35, -0.33)[0], 0.62, spin(0.35, -0.33)[1]],
      rotation: [0, yaw, 0],
      size: [2.1, 0.5, 0.16],
      color: shade(velour, 0.92),
      carriesAttachments: true,
      weathering: 0.28,
    }),
    selfContact({
      id: "back:wing",
      material: "plastic",
      shape: "panel",
      position: [spin(-1.18, 0.35)[0], 0.62, spin(-1.18, 0.35)[1]],
      rotation: [0, yaw, 0],
      size: [0.16, 0.5, 1.55],
      color: shade(velour, 0.92),
      carriesAttachments: true,
      weathering: 0.28,
    }),
  );
  // Веерные «ракушки»: по одной над каждым посадочным местом.
  for (let shell = 0; shell < 4; shell += 1) {
    const lx = -0.4 + shell * 0.5;
    const [px, pz] = spin(lx, -0.27);
    pieces.push(selfContact({
      id: `shell:main:${shell}`,
      material: "cloth",
      shape: "panel",
      position: [px, 0.78, pz],
      rotation: [0, yaw + (shell % 2 === 0 ? 0.04 : -0.04), 0],
      size: [0.5, 0.44, 0.15],
      color: shade(velour, 1.07),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: 0.3,
    }));
  }
  for (let shell = 0; shell < 2; shell += 1) {
    const lz = 0.12 + shell * 0.52;
    const [px, pz] = spin(-1.12, lz);
    pieces.push(selfContact({
      id: `shell:wing:${shell}`,
      material: "cloth",
      shape: "panel",
      position: [px, 0.78, pz],
      rotation: [0, yaw, 0],
      size: [0.15, 0.44, 0.5],
      color: shade(velour, 1.07),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      weathering: 0.3,
    }));
  }
  // Лакированные вставки по фронту цоколя.
  for (const [index, lx] of [-0.35, 0.35, 1.05].entries()) {
    const [px, pz] = spin(lx, 0.44);
    pieces.push(selfContact({
      id: `trim:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.13, pz],
      rotation: [0, yaw, 0],
      size: [0.34, 0.12, 0.02],
      color: trim,
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      weathering: 0.2,
    }));
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Стенка
// ---------------------------------------------------------------------------

/**
 * Советская «стенка»: платяной шкаф с зеркалом, витрина со стеклом и
 * посудой, открытые полки с книгами и ниша под телевизор, антресольный
 * шкаф. Дверцы на петлях, стекло бьётся, книги разлетаются по одной.
 */
export function propWallUnit(options: {
  readonly yaw?: number;
  readonly timber?: string;
  readonly seed?: number;
  /** Трёхсекционный вариант (без шкафа с антресолью) для тесных комнат. */
  readonly compact?: boolean;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const timber = options.timber ?? "#77492b";
  const seed = options.seed ?? 9;
  const compact = options.compact ?? false;
  const spin = spinner(yaw);
  const facade = shade(timber, 1.12);
  const depth = 0.42;
  const height = 2.2;
  const walls = compact
    ? [-1.14, -0.36, 0.39, 1.14]
    : [-1.5, -0.72, 0.03, 0.78, 1.5];
  const span = walls[walls.length - 1] - walls[0];
  const frontZ = depth / 2 - 0.02;
  const pieces: FurniturePiece[] = [];
  const bookColors = ["#7a2e24", "#2e4a6b", "#b08a3e", "#4a6b35", "#8a8a88", "#5b3350"];

  // Цоколь несёт стойки; стойки несут полки, дверцы и крышу.
  pieces.push(selfContact({
    id: "plinth",
    material: "wood",
    shape: "plank",
    position: [0, 0.05, 0],
    rotation: [0, yaw, 0],
    size: [span + 0.04, 0.1, depth - 0.04],
    color: shade(timber, 0.85),
    carriesAttachments: true,
    weathering: 0.25,
  }));
  for (const [index, wx] of walls.entries()) {
    const [px, pz] = spin(wx, 0);
    pieces.push(selfContact({
      id: `wall:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.1 + (height - 0.15) / 2, pz],
      rotation: [0, yaw, 0],
      size: [0.035, height - 0.15, depth],
      color: timber,
      carriesAttachments: true,
      attachmentSupportMode: "hinge",
      weathering: 0.22,
    }));
  }
  // Карниз — декор: bearsLoad false, иначе в комнате плита перекрытия
  // (бетон прощает до ~0.2 м зазора) «садится» на него и давит стойки.
  pieces.push(selfContact({
    id: "crown",
    material: "wood",
    shape: "plank",
    position: [0, height - 0.03, 0],
    rotation: [0, yaw, 0],
    size: [span + 0.08, 0.06, depth + 0.02],
    color: shade(timber, 0.92),
    bearsLoad: false,
    weathering: 0.22,
  }));

  const bay = (index: number): readonly [number, number] => [
    (walls[index] + walls[index + 1]) / 2,
    walls[index + 1] - walls[index] - 0.05,
  ];

  // --- Секция 0: платяной шкаф с зеркальной дверью и ящиками -------------
  {
    const [cx, cw] = bay(0);
    const [dx, dz] = spin(cx, frontZ);
    pieces.push(
      {
        ...selfContact({
          id: "wardrobe:door",
          material: "wood",
          shape: "plank",
          position: [dx, 1.25, dz],
          rotation: [0, yaw, 0],
          size: [cw, 1.6, 0.03],
          color: facade,
          carriesAttachments: true,
          attachmentSupportMode: "hinge",
          sideAttachmentReach: 0.08,
          weathering: 0.22,
        }),
      },
      {
        id: "wardrobe:mirror",
        material: "glass",
        shape: "glassPane",
        position: [spin(cx, frontZ + 0.025)[0], 1.3, spin(cx, frontZ + 0.025)[1]],
        rotation: [0, yaw, 0],
        size: [cw - 0.18, 1.28, 0.012],
        color: "#b9c6c8",
        bearsLoad: false,
        sideAttachmentReach: 0.06,
        contactBoxes: [{
          position: [spin(cx, frontZ + 0.025)[0], 1.3, spin(cx, frontZ + 0.025)[1]],
          size: [cw - 0.18, 1.28, 0.03],
        }],
      },
    );
    for (const [index, drawerY] of [0.24, 0.42].entries()) {
      pieces.push(selfContact({
        id: `wardrobe:drawer:${index}`,
        material: "wood",
        shape: "plank",
        position: [dx, drawerY, dz],
        rotation: [0, yaw, 0],
        size: [cw, 0.16, 0.03],
        color: shade(facade, 0.95),
        bearsLoad: false,
        sideAttachmentReach: 0.08,
        weathering: 0.22,
      }));
    }
  }

  // --- Секция 1: витрина со стеклом, полками и посудой -------------------
  {
    const [cx, cw] = bay(1);
    for (const [index, shelfY] of [0.95, 1.4, 1.8].entries()) {
      const [px, pz] = spin(cx, -0.02);
      pieces.push(selfContact({
        id: `vitrine:shelf:${index}`,
        material: "wood",
        shape: "plank",
        position: [px, shelfY, pz],
        rotation: [0, yaw, 0],
        size: [cw, 0.025, depth - 0.1],
        color: shade(timber, 1.05),
        sideAttachmentReach: 0.08,
        weathering: 0.2,
      }));
    }
    // Посуда: высокие вазы на полках. Стоят точно на полке — тонкая полка
    // держит только то, чей центр заметно выше её собственного.
    for (let item = 0; item < 3; item += 1) {
      const shelfY = item < 2 ? 0.95 : 1.4;
      const lx = cx + (rand(seed, 60 + item) - 0.5) * (cw - 0.2);
      const [px, pz] = spin(lx, -0.04);
      pieces.push(selfContact({
        id: `vitrine:china:${item}`,
        material: "glass",
        shape: "cylinder",
        position: [px, shelfY + 0.0125 + 0.11, pz],
        size: [0.07 + rand(seed, 70 + item) * 0.04, 0.22, 0.07],
        color: item % 2 === 0 ? "#c9d4cd" : "#b58a8a",
        bearsLoad: false,
      }));
    }
    for (const side of [-1, 1] as const) {
      const doorCx = cx + side * cw / 4;
      const [dx, dz] = spin(doorCx, frontZ);
      pieces.push({
        id: `vitrine:glass:${side}`,
        material: "glass",
        shape: "glassPane",
        position: [dx, 1.45, dz],
        rotation: [0, yaw, 0],
        size: [cw / 2 - 0.02, 1.06, 0.015],
        color: "#a9bcbe",
        bearsLoad: false,
        sideAttachmentReach: 0.07,
        contactBoxes: [{ position: [dx, 1.45, dz], size: [cw / 2 - 0.02, 1.06, 0.03] }],
      });
    }
    // Глухая тумба снизу.
    const [dx, dz] = spin(cx, frontZ);
    pieces.push(selfContact({
      id: "vitrine:cupboard",
      material: "wood",
      shape: "plank",
      position: [dx, 0.5, dz],
      rotation: [0, yaw, 0],
      size: [cw, 0.72, 0.03],
      color: facade,
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      weathering: 0.22,
    }));
  }

  // --- Секция 2: открытые полки с книгами, ниша под телевизор ------------
  {
    const [cx, cw] = bay(2);
    for (const [index, shelfY] of [1.32, 1.76].entries()) {
      const [px, pz] = spin(cx, -0.02);
      pieces.push(selfContact({
        id: `shelf:open:${index}`,
        material: "wood",
        shape: "plank",
        position: [px, shelfY, pz],
        rotation: [0, yaw, 0],
        size: [cw, 0.025, depth - 0.1],
        color: shade(timber, 1.05),
        sideAttachmentReach: 0.08,
        weathering: 0.2,
      }));
      // Книги: разноцветные корешки, стоят группой со случайным прогалом.
      let bx = cx - cw / 2 + 0.06;
      let book = 0;
      while (bx < cx + cw / 2 - 0.1) {
        const thickness = 0.035 + rand(seed, index * 40 + book) * 0.045;
        const bookHeight = 0.2 + rand(seed, index * 40 + book + 20) * 0.1;
        if (rand(seed, index * 40 + book + 200) < 0.16) {
          bx += 0.09; // прогал на полке
          book += 1;
          continue;
        }
        const [px, pz] = spin(bx + thickness / 2, -0.03);
        pieces.push(selfContact({
          id: `book:${index}:${book}`,
          material: "wood",
          shape: "plank",
          position: [px, shelfY + 0.0125 + bookHeight / 2, pz],
          rotation: [0, yaw, 0],
          size: [thickness, bookHeight, 0.2],
          color: bookColors[Math.floor(rand(seed, index * 40 + book + 100) * bookColors.length)],
          bearsLoad: false,
          weathering: 0.12,
        }));
        bx += thickness + 0.006;
        book += 1;
      }
    }
    // Тумба-основание ниши ТВ.
    const [px, pz] = spin(cx, 0);
    pieces.push(selfContact({
      id: "tv:pedestal",
      material: "wood",
      shape: "plank",
      position: [px, 0.44, pz],
      rotation: [0, yaw, 0],
      size: [cw, 0.6, depth - 0.06],
      color: facade,
      carriesAttachments: true,
      weathering: 0.22,
    }));
  }

  // --- Секция 3: шкаф с антресолью (в компактном варианте отсутствует) ---
  if (!compact) {
    const [cx, cw] = bay(3);
    const [dx, dz] = spin(cx, frontZ);
    for (const side of [-1, 1] as const) {
      const doorCx = cx + side * cw / 4;
      const [ddx, ddz] = spin(doorCx, frontZ);
      pieces.push({
        ...selfContact({
          id: `cabinet:door:${side}`,
          material: "wood",
          shape: "plank",
          position: [ddx, 0.95, ddz],
          rotation: [0, yaw, 0],
          size: [cw / 2 - 0.02, 1.5, 0.03],
          color: facade,
          attachmentSupportMode: "hinge",
          sideAttachmentReach: 0.08,
          weathering: 0.22,
        }),
      });
    }
    pieces.push({
      ...selfContact({
        id: "cabinet:mezzanine",
        material: "wood",
        shape: "plank",
        position: [dx, 1.94, dz],
        rotation: [0, yaw, 0],
        size: [cw, 0.34, 0.03],
        color: shade(facade, 0.96),
        sideAttachmentReach: 0.08,
        weathering: 0.22,
      }),
    });
  }
  return pieces;
}

/** Простой крашеный кухонный стол: охристые ножки, истёртая тёмная крышка. */
export function propPaintedTable(options: {
  readonly yaw?: number;
  readonly seed?: number;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const seed = options.seed ?? 13;
  const spin = spinner(yaw);
  const paint = "#b5802e";
  const pieces: FurniturePiece[] = [];

  for (const [index, [lx, lz]] of ([
    [-0.4, -0.24],
    [0.4, -0.24],
    [-0.4, 0.24],
    [0.4, 0.24],
  ] as const).entries()) {
    const [px, pz] = spin(lx, lz);
    pieces.push(selfContact({
      id: `leg:${index}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.35, pz],
      rotation: [0, yaw, 0],
      size: [0.06, 0.7, 0.06],
      color: shade(paint, 0.9 + (index % 2) * 0.08),
      carriesAttachments: true,
      weathering: 0.4,
    }));
  }
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(0, side * 0.24);
    pieces.push(selfContact({
      id: `apron:${side}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.62, pz],
      rotation: [0, yaw, 0],
      size: [0.74, 0.1, 0.045],
      color: paint,
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.4,
    }));
  }
  pieces.push(selfContact({
    id: "top",
    material: "wood",
    shape: "plank",
    position: [0, 0.725, 0],
    rotation: [0, yaw, 0],
    size: [0.94, 0.05, 0.6],
    color: "#6b4a30",
    carriesAttachments: true,
    weathering: 0.45,
  }));
  // Проплешины гнили и старой краски на крышке.
  for (let patch = 0; patch < 2; patch += 1) {
    const w = 0.14 + rand(seed, 10 + patch) * 0.16;
    const [px, pz] = spin(
      (rand(seed, 20 + patch) - 0.5) * (0.86 - w),
      (rand(seed, 30 + patch) - 0.5) * 0.4,
    );
    pieces.push(selfContact({
      id: `worn:${patch}`,
      material: "wood",
      shape: "plank",
      position: [px, 0.7535, pz],
      rotation: [0, yaw + (rand(seed, 40 + patch) - 0.5) * 0.3, 0],
      size: [w, 0.012, w * 0.7],
      color: patch === 0 ? "#3f2f22" : "#8a7350",
      bearsLoad: false,
      weathering: 0.3,
    }));
  }
  return pieces;
}

/** Деревянная кровать: реечные щиты изголовья и изножья, царги, постель. */
export function propSlatBed(options: {
  readonly yaw?: number;
  readonly timber?: string;
} = {}): FurniturePiece[] {
  const yaw = options.yaw ?? 0;
  const timber = options.timber ?? "#8a4a2e";
  const spin = spinner(yaw);
  const halfX = 0.48;
  const halfZ = 1.0;
  const railY = 0.36;
  const pieces: FurniturePiece[] = [];

  for (const endSide of [-1, 1] as const) {
    const top = endSide < 0 ? 0.92 : 0.7;
    const lz = endSide * halfZ;
    for (const side of [-1, 1] as const) {
      const [px, pz] = spin(side * halfX, lz);
      pieces.push(selfContact({
        id: `post:${endSide}:${side}`,
        material: "wood",
        shape: "plank",
        position: [px, top / 2, pz],
        rotation: [0, yaw, 0],
        size: [0.07, top, 0.07],
        color: shade(timber, 0.88),
        carriesAttachments: true,
        weathering: 0.3,
      }));
    }
    // Горизонтальные рейки щита между стойками.
    const slats = endSide < 0 ? [top - 0.08, top - 0.22, top - 0.36] : [top - 0.08, top - 0.24];
    for (const [index, slatY] of slats.entries()) {
      const [px, pz] = spin(0, lz);
      pieces.push(selfContact({
        id: `slat:${endSide}:${index}`,
        material: "wood",
        shape: "plank",
        position: [px, slatY, pz],
        rotation: [0, yaw, 0],
        size: [halfX * 2 - 0.1, 0.09, 0.035],
        color: shade(timber, 1.0 + index * 0.05),
        bearsLoad: false,
        sideAttachmentReach: 0.12,
        weathering: 0.3,
      }));
    }
  }

  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * halfX, 0);
    pieces.push(selfContact({
      id: `rail:${side}`,
      material: "wood",
      shape: "plank",
      position: [px, railY, pz],
      rotation: [0, yaw, 0],
      size: [0.05, 0.14, halfZ * 2 - 0.1],
      color: timber,
      sideAttachmentReach: 0.14,
      carriesAttachments: true,
      weathering: 0.3,
    }));
  }

  pieces.push(
    selfContact({
      id: "mattress",
      material: "cloth",
      shape: "panel",
      position: [0, railY + 0.13, 0],
      rotation: [0, yaw, 0],
      size: [halfX * 2 + 0.02, 0.22, halfZ * 2 - 0.1],
      color: "#cfc7b8",
      carriesAttachments: true,
      weathering: 0.16,
    }),
    selfContact({
      id: "blanket",
      material: "cloth",
      shape: "panel",
      position: [spin(0, 0.22)[0], railY + 0.27, spin(0, 0.22)[1]],
      rotation: [0, yaw, 0],
      size: [halfX * 2 + 0.08, 0.05, halfZ * 2 - 0.7],
      color: "#7c8794",
      bearsLoad: false,
      weathering: 0.18,
    }),
    selfContact({
      id: "pillow",
      material: "cloth",
      shape: "panel",
      position: [spin(0, -halfZ + 0.34)[0], railY + 0.3, spin(0, -halfZ + 0.34)[1]],
      rotation: [0, yaw - 0.05, 0],
      size: [0.5, 0.1, 0.34],
      color: "#e3dccb",
      bearsLoad: false,
      weathering: 0.1,
    }),
  );
  return pieces;
}
