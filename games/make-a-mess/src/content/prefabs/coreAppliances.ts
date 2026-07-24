import type { ScenePrefabPieceDefinition } from "../scenes/sceneContract.ts";
import { rand, selfContact, shade, spinner } from "./coreFurniture.ts";

/**
 * Бытовая техника — плиты, холодильники, телевизоры и кухонная посуда.
 *
 * Каждый прибор собран из тех деталей, из которых он ломается: дверцы висят
 * на настоящих петлях (распахиваются и отлетают), конфорки и ручки-крутилки
 * сбиваются по одной, стёкла духовок и кинескопы бьются, внутри холодильника
 * стоят полки, которые видно, когда дверь уже на полу. Ржавчина и жир — не
 * текстура, а навесные пятна-патчи, которые тоже можно сбить.
 *
 * Билдеры возвращают детали в ЛОКАЛЬНЫХ координатах (origin — пол под центром
 * прибора); yaw поворачивает прибор целиком вместе с петлями.
 */

export type AppliancePiece = ScenePrefabPieceDefinition;

// ---------------------------------------------------------------------------
// Плиты
// ---------------------------------------------------------------------------

/**
 * Старая газовая плита «Газоаппарат»: кремовый корпус на гнутых ножках,
 * нависающая чугунная столешница, четыре конфорки, пять крутилок и духовка.
 */
export function propVintageStove(options: {
  readonly yaw?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const cream = "#d6d0c0";
  const iron = "#2b2b28";
  const pieces: AppliancePiece[] = [];

  // Гнутые ножки: тонкие цилиндры, чуть расставленные наружу.
  for (const [index, [lx, lz]] of ([
    [-0.26, -0.22],
    [0.26, -0.22],
    [-0.26, 0.24],
    [0.26, 0.24],
  ] as const).entries()) {
    const [px, pz] = spin(lx, lz);
    pieces.push(selfContact({
      id: `leg:${index}`,
      material: "steel",
      shape: "cylinder",
      position: [px, 0.175, pz],
      size: [0.035, 0.35, 0.035],
      color: shade(cream, 0.92),
      weathering: 0.4,
    }));
  }

  // Корпус духовки стоит на ножках, несёт столешницу и навеску.
  pieces.push(selfContact({
    id: "body",
    material: "steel",
    shape: "steelSheet",
    position: [0, 0.62, 0.01],
    rotation: [0, yaw, 0],
    size: [0.6, 0.54, 0.52],
    color: cream,
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    weathering: 0.35,
  }));

  // Панель крутилок над духовкой.
  {
    const [px, pz] = spin(0, 0.28);
    pieces.push(selfContact({
      id: "fascia",
      material: "steel",
      shape: "steelSheet",
      position: [px, 0.955, pz],
      rotation: [0, yaw, 0],
      size: [0.6, 0.13, 0.045],
      color: shade(cream, 0.97),
      carriesAttachments: true,
    attachmentSupportMode: "hinge",
      sideAttachmentReach: 0.1,
      weathering: 0.3,
    }));
  }
  for (let knob = 0; knob < 5; knob += 1) {
    const [px, pz] = spin(-0.22 + knob * 0.11, 0.315);
    pieces.push(selfContact({
      id: `knob:${knob}`,
      material: "plastic",
      shape: "cylinder",
      position: [px, 0.955, pz],
      rotation: [Math.PI / 2, yaw, 0],
      size: [0.05, 0.035, 0.05],
      color: "#1f1e1c",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
    }));
  }

  // Чугунная столешница нависает над корпусом, как на фото.
  pieces.push(selfContact({
    id: "cooktop",
    material: "steel",
    shape: "steelSheet",
    position: [0, 1.05, 0],
    rotation: [0, yaw, 0],
    size: [0.74, 0.05, 0.62],
    color: iron,
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    weathering: 0.5,
  }));
  for (const [index, [bx, bz]] of ([
    [-0.17, -0.14],
    [0.17, -0.14],
    [-0.17, 0.16],
    [0.17, 0.16],
  ] as const).entries()) {
    const [px, pz] = spin(bx, bz);
    pieces.push(selfContact({
      id: `burner:${index}`,
      material: "steel",
      shape: "cylinder",
      position: [px, 1.09, pz],
      size: [0.15, 0.03, 0.15],
      color: shade(iron, 1.35),
      bearsLoad: false,
      weathering: 0.45,
    }));
  }

  // Дверца духовки на нижней навеске упрощена до навесной панели с ручкой.
  {
    const [px, pz] = spin(0, 0.285);
    pieces.push(
      selfContact({
        id: "oven:door",
        material: "steel",
        shape: "steelSheet",
        position: [px, 0.6, pz],
        rotation: [0, yaw, 0],
        size: [0.5, 0.4, 0.035],
        color: shade(cream, 1.03),
        bearsLoad: false,
        sideAttachmentReach: 0.1,
        weathering: 0.35,
      }),
      selfContact({
        id: "oven:handle",
        material: "plastic",
        shape: "cylinder",
        position: [px, 0.72, pz + (Math.cos(yaw) >= 0 ? 0.035 : -0.035)],
        rotation: [0, yaw, Math.PI / 2],
        size: [0.035, 0.3, 0.035],
        color: "#242422",
        bearsLoad: false,
        sideAttachmentReach: 0.08,
      }),
    );
  }
  return pieces;
}

/**
 * Газовая плита 70-80-х: белый корпус, четыре чёрные решётки конфорок,
 * пять крутилок (одна коричневая), духовка со стеклом на петле снизу.
 */
export function propGasStove(options: {
  readonly yaw?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const white = "#e2dfd6";
  const pieces: AppliancePiece[] = [];

  pieces.push(selfContact({
    id: "body",
    material: "steel",
    shape: "steelSheet",
    position: [0, 0.43, 0],
    rotation: [0, yaw, 0],
    size: [0.52, 0.86, 0.5],
    color: white,
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    weathering: 0.3,
  }));

  // Варочная панель и решётки конфорок.
  pieces.push(selfContact({
    id: "cooktop",
    material: "steel",
    shape: "steelSheet",
    position: [0, 0.875, 0],
    rotation: [0, yaw, 0],
    size: [0.54, 0.035, 0.52],
    color: shade(white, 0.96),
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    weathering: 0.35,
  }));
  for (const [index, [gx, gz]] of ([
    [-0.13, -0.12],
    [0.13, -0.12],
    [-0.13, 0.13],
    [0.13, 0.13],
  ] as const).entries()) {
    const [px, pz] = spin(gx, gz);
    pieces.push(
      selfContact({
        id: `grate:${index}`,
        material: "steel",
        shape: "steelSheet",
        position: [px, 0.9, pz],
        rotation: [0, yaw, 0],
        size: [0.2, 0.018, 0.2],
        color: "#32302c",
        bearsLoad: false,
        weathering: 0.4,
      }),
      selfContact({
        id: `burner:${index}`,
        material: "steel",
        shape: "cylinder",
        position: [px, 0.915, pz],
        size: [0.075, 0.02, 0.075],
        color: "#4a463f",
        bearsLoad: false,
        weathering: 0.45,
      }),
    );
  }

  // Пять крутилок, крайняя левая — коричневая, как на фото.
  for (let knob = 0; knob < 5; knob += 1) {
    const [px, pz] = spin(-0.18 + knob * 0.09, 0.255);
    pieces.push(selfContact({
      id: `knob:${knob}`,
      material: "plastic",
      shape: "cylinder",
      position: [px, 0.795, pz],
      rotation: [Math.PI / 2, yaw, 0],
      size: [0.055, 0.03, 0.055],
      color: knob === 0 ? "#5e3226" : "#26231f",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
    }));
  }

  // Дверца духовки: белая рама + тёмное стекло + металлическая ручка.
  {
    const [px, pz] = spin(0, 0.262);
    pieces.push(
      selfContact({
        id: "oven:door",
        material: "steel",
        shape: "steelSheet",
        position: [px, 0.42, pz],
        rotation: [0, yaw, 0],
        size: [0.48, 0.42, 0.03],
        color: white,
        bearsLoad: false,
        carriesAttachments: true,
    attachmentSupportMode: "hinge",
        sideAttachmentReach: 0.1,
        weathering: 0.3,
      }),
      {
        id: "oven:glass",
        material: "darkGlass",
        shape: "glassPane",
        position: [spin(0, 0.28)[0], 0.43, spin(0, 0.28)[1]],
        rotation: [0, yaw, 0],
        size: [0.32, 0.24, 0.015],
        color: "#1d1b19",
        bearsLoad: false,
        sideAttachmentReach: 0.08,
      },
      selfContact({
        id: "oven:handle",
        material: "steel",
        shape: "cylinder",
        position: [spin(0, 0.295)[0], 0.6, spin(0, 0.295)[1]],
        rotation: [0, yaw, Math.PI / 2],
        size: [0.028, 0.42, 0.028],
        color: "#b9beba",
        bearsLoad: false,
        sideAttachmentReach: 0.08,
      }),
    );
  }

  // Ящик для противней под духовкой.
  {
    const [px, pz] = spin(0, 0.262);
    pieces.push(selfContact({
      id: "drawer",
      material: "steel",
      shape: "steelSheet",
      position: [px, 0.1, pz],
      rotation: [0, yaw, 0],
      size: [0.48, 0.16, 0.03],
      color: shade(white, 0.94),
      bearsLoad: false,
      sideAttachmentReach: 0.1,
      weathering: 0.32,
    }));
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Холодильники
// ---------------------------------------------------------------------------

interface FridgeShellOptions {
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly color: string;
  readonly wear: number;
}

/**
 * Общий скелет холодильника: корпус-коробка, внутри две белые полки, которые
 * становятся видны (и выбиваемы), когда дверь слетает с петель.
 */
function fridgeShell(options: FridgeShellOptions): AppliancePiece[] {
  const { yaw, width, height, depth, color, wear } = options;
  const spin = spinner(yaw);
  const pieces: AppliancePiece[] = [];

  // Корпус без передней грани моделируем боковинами, задником и крышей:
  // так внутренние полки честно опираются на боковины, а не тонут в боксе.
  for (const side of [-1, 1] as const) {
    const [px, pz] = spin(side * (width / 2 - 0.02), -0.03);
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    pieces.push({
      id: `wall:${side}`,
      material: "steel",
      shape: "steelSheet",
      position: [px, height / 2, pz],
      rotation: [0, yaw, 0],
      size: [0.04, height, depth - 0.06],
      color,
      carriesAttachments: true,
      attachmentSupportMode: "hinge",
      weathering: wear,
      // Боковина — часть жёсткого короба: несущий след шире листа, иначе
      // тонкая стенка «перегружается» навеской дверей в общей сцене.
      contactBoxes: [{
        position: [px, height / 2, pz],
        size: [
          0.09 * cos + (depth - 0.06) * sin,
          height,
          0.09 * sin + (depth - 0.06) * cos,
        ],
      }],
    });
  }
  {
    const [px, pz] = spin(0, -depth / 2 + 0.02);
    pieces.push(selfContact({
      id: "back",
      material: "steel",
      shape: "steelSheet",
      position: [px, height / 2, pz],
      rotation: [0, yaw, 0],
      size: [width - 0.08, height, 0.04],
      color: shade(color, 0.92),
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      weathering: wear,
    }));
  }
  {
    const [px, pz] = spin(0, -0.03);
    pieces.push(selfContact({
      id: "top",
      material: "steel",
      shape: "steelSheet",
      position: [px, height - 0.025, pz],
      rotation: [0, yaw, 0],
      size: [width, 0.05, depth - 0.06],
      color: shade(color, 1.02),
      weathering: wear,
    }));
  }
  for (const [index, shelfY] of [height * 0.38, height * 0.62].entries()) {
    const [px, pz] = spin(0, -0.05);
    pieces.push(selfContact({
      id: `shelf:${index}`,
      material: "steel",
      shape: "steelSheet",
      position: [px, shelfY, pz],
      rotation: [0, yaw, 0],
      size: [width - 0.1, 0.02, depth - 0.14],
      color: "#e8e6df",
      sideAttachmentReach: 0.08,
      weathering: 0.1,
    }));
  }
  return pieces;
}

/** Холодильник «Москва»: белый, хром-молдинг, ручка-рычаг, дверь на петле. */
export function propFridgeMoskva(options: {
  readonly yaw?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const white = "#e5e2d8";
  const width = 0.62;
  const height = 1.5;
  const depth = 0.6;
  const doorZ = depth / 2 - 0.025;
  const pieces = fridgeShell({ yaw, width, height, depth, color: white, wear: 0.22 });

  const [dx, dz] = spin(0, doorZ);
  pieces.push(
    {
      ...selfContact({
        id: "door",
        material: "steel",
        shape: "steelSheet",
        position: [dx, height / 2 - 0.02, dz],
        rotation: [0, yaw, 0],
        size: [width, height - 0.09, 0.05],
        // Полая жестяная дверца: треть объёма болванки.
        volume: width * (height - 0.09) * 0.05 * 0.3,
        color: white,
        carriesAttachments: true,
    attachmentSupportMode: "hinge",
        sideAttachmentReach: 0.18,
        weathering: 0.22,
      }),
    },
    // Хромированный молдинг поперёк двери и ручка-рычаг.
    selfContact({
      id: "trim",
      material: "steel",
      shape: "steelSheet",
      position: [spin(0, doorZ + 0.03)[0], height * 0.78, spin(0, doorZ + 0.03)[1]],
      rotation: [0, yaw, 0],
      size: [width - 0.06, 0.025, 0.012],
      color: "#c7ccc9",
      bearsLoad: false,
      sideAttachmentReach: 0.14,
    }),
    selfContact({
      id: "handle",
      material: "steel",
      shape: "steelSheet",
      position: [spin(width * 0.28, doorZ + 0.045)[0], height * 0.52, spin(width * 0.28, doorZ + 0.045)[1]],
      rotation: [0, yaw, 0],
      size: [0.2, 0.045, 0.04],
      color: "#cdd2cf",
      bearsLoad: false,
      sideAttachmentReach: 0.14,
    }),
    selfContact({
      id: "badge",
      material: "steel",
      shape: "steelSheet",
      position: [spin(0, doorZ + 0.032)[0], height * 0.88, spin(0, doorZ + 0.032)[1]],
      rotation: [0, yaw, 0],
      size: [0.14, 0.035, 0.012],
      color: "#a8873e",
      bearsLoad: false,
      sideAttachmentReach: 0.14,
    }),
  );
  return pieces;
}

/**
 * Серо-зелёный холодильник с рёбрами: отдельная дверца морозилки сверху,
 * основная дверь снизу, горизонтальные молдинги, потёртость сильнее.
 */
export function propFridgeRibbed(options: {
  readonly yaw?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const body = "#b7bdb3";
  const width = 0.66;
  const height = 1.58;
  const depth = 0.64;
  const doorZ = depth / 2 - 0.025;
  const split = height * 0.72;
  const pieces = fridgeShell({ yaw, width, height, depth, color: body, wear: 0.5 });

  const [dx, dz] = spin(0, doorZ);
  pieces.push(
    {
      ...selfContact({
        id: "door:freezer",
        material: "steel",
        shape: "steelSheet",
        position: [dx, (split + height - 0.06) / 2 + 0.02, dz],
        rotation: [0, yaw, 0],
        size: [width, height - 0.06 - split, 0.05],
        // Полая жестяная дверца: треть объёма болванки.
        volume: width * (height - 0.06 - split) * 0.05 * 0.3,
        color: shade(body, 1.04),
        carriesAttachments: true,
    attachmentSupportMode: "hinge",
        sideAttachmentReach: 0.18,
        weathering: 0.5,
      }),
    },
    {
      ...selfContact({
        id: "door:main",
        material: "steel",
        shape: "steelSheet",
        position: [dx, (split - 0.02 + 0.14) / 2, dz],
        rotation: [0, yaw, 0],
        size: [width, split - 0.16, 0.05],
        // Полая жестяная дверца: треть объёма болванки.
        volume: width * (split - 0.16) * 0.05 * 0.3,
        color: body,
        carriesAttachments: true,
    attachmentSupportMode: "hinge",
        sideAttachmentReach: 0.18,
        weathering: 0.52,
      }),
    },
  );
  for (const [index, handleY] of [split + 0.12, split - 0.14].entries()) {
    pieces.push(selfContact({
      id: `handle:${index}`,
      material: "steel",
      shape: "steelSheet",
      position: [spin(-width * 0.16, doorZ + 0.045)[0], handleY, spin(-width * 0.16, doorZ + 0.045)[1]],
      rotation: [0, yaw, 0],
      size: [0.18, 0.04, 0.04],
      color: "#c9cecb",
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.3,
    }));
  }
  for (const [index, ribY] of [split - 0.28, split - 0.36, split - 0.44].entries()) {
    pieces.push(selfContact({
      id: `rib:${index}`,
      material: "steel",
      shape: "steelSheet",
      position: [spin(0, doorZ + 0.03)[0], ribY, spin(0, doorZ + 0.03)[1]],
      rotation: [0, yaw, 0],
      size: [width - 0.05, 0.018, 0.012],
      color: shade(body, 0.9),
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      weathering: 0.45,
    }));
  }
  // Нижняя панель-цоколь.
  pieces.push(selfContact({
    id: "kick",
    material: "steel",
    shape: "steelSheet",
    position: [spin(0, doorZ - 0.01)[0], 0.07, spin(0, doorZ - 0.01)[1]],
    rotation: [0, yaw, 0],
    size: [width - 0.04, 0.12, 0.03],
    color: shade(body, 0.85),
    bearsLoad: false,
    sideAttachmentReach: 0.1,
    weathering: 0.6,
  }));
  return pieces;
}

/**
 * Ржавый дачный холодильник: кремовый остов, пятна ржавчины — навесные
 * патчи, круглая ручка-кольцо, вентиляционная решётка снизу. Живёт на улице.
 */
export function propFridgeRusty(options: {
  readonly yaw?: number;
  readonly seed?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const seed = options.seed ?? 11;
  const spin = spinner(yaw);
  const body = "#c9bfab";
  const rust = ["#96552c", "#7c451f", "#a86a35"];
  const width = 0.64;
  const height = 1.5;
  const depth = 0.6;
  const doorZ = depth / 2 - 0.025;
  const pieces = fridgeShell({ yaw, width, height, depth, color: body, wear: 0.85 });

  const [dx, dz] = spin(0, doorZ);
  pieces.push(
    {
      ...selfContact({
        id: "door",
        material: "steel",
        shape: "steelSheet",
        position: [dx, height / 2 + 0.04, dz],
        rotation: [0, yaw, 0],
        size: [width, height - 0.34, 0.05],
        // Полая жестяная дверца: треть объёма болванки.
        volume: width * (height - 0.34) * 0.05 * 0.3,
        color: shade(body, 1.02),
        carriesAttachments: true,
    attachmentSupportMode: "hinge",
        sideAttachmentReach: 0.18,
        weathering: 0.85,
      }),
    },
    selfContact({
      id: "handle",
      material: "steel",
      shape: "cylinder",
      position: [spin(-width * 0.3, doorZ + 0.05)[0], height * 0.62, spin(-width * 0.3, doorZ + 0.05)[1]],
      rotation: [Math.PI / 2, yaw, 0],
      size: [0.1, 0.03, 0.1],
      color: "#b3b8b4",
      bearsLoad: false,
      sideAttachmentReach: 0.14,
      weathering: 0.5,
    }),
    selfContact({
      id: "vent",
      material: "steel",
      shape: "steelSheet",
      position: [spin(0, doorZ - 0.005)[0], 0.1, spin(0, doorZ - 0.005)[1]],
      rotation: [0, yaw, 0],
      size: [width - 0.1, 0.14, 0.03],
      color: "#8a8578",
      bearsLoad: false,
      sideAttachmentReach: 0.1,
      weathering: 0.8,
    }),
  );
  // Пятна ржавчины: навесные тонкие панельки поверх двери и корпуса.
  for (let patch = 0; patch < 4; patch += 1) {
    const w = 0.12 + rand(seed, 10 + patch) * 0.2;
    const h = 0.1 + rand(seed, 20 + patch) * 0.26;
    const lx = (rand(seed, 30 + patch) - 0.5) * (width - w - 0.06);
    const ly = 0.3 + rand(seed, 40 + patch) * (height - 0.7);
    pieces.push(selfContact({
      id: `rust:${patch}`,
      material: "steel",
      shape: "steelSheet",
      position: [spin(lx, doorZ + 0.032)[0], ly, spin(lx, doorZ + 0.032)[1]],
      rotation: [0, yaw + (rand(seed, 50 + patch) - 0.5) * 0.2, 0],
      size: [w, h, 0.008],
      color: rust[patch % rust.length],
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      weathering: 0.6,
    }));
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Телевизоры
// ---------------------------------------------------------------------------

/** Советский ламповый «Горизонт»: деревянный корпус, экран, панель динамика. */
export function propTvSoviet(options: {
  readonly yaw?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const timber = "#6b452a";
  const pieces: AppliancePiece[] = [];

  pieces.push(selfContact({
    id: "cabinet",
    material: "wood",
    shape: "plank",
    position: [0, 0.23, 0],
    rotation: [0, yaw, 0],
    size: [0.62, 0.46, 0.4],
    color: timber,
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    weathering: 0.3,
  }));
  pieces.push(
    {
      id: "screen",
      material: "glass",
      shape: "glassPane",
      position: [spin(-0.06, 0.185)[0], 0.25, spin(-0.06, 0.185)[1]],
      rotation: [0, yaw, 0],
      size: [0.42, 0.34, 0.04],
      color: "#c7ccc2",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      contactBoxes: [{
        position: [spin(-0.06, 0.185)[0], 0.25, spin(-0.06, 0.185)[1]],
        size: [0.42, 0.34, 0.06],
      }],
    },
    selfContact({
      id: "speaker",
      material: "cloth",
      shape: "panel",
      position: [spin(0.24, 0.19)[0], 0.27, spin(0.24, 0.19)[1]],
      rotation: [0, yaw, 0],
      size: [0.1, 0.24, 0.025],
      color: "#392f26",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
    }),
  );
  for (const [index, knobY] of [0.1, 0.1].entries()) {
    pieces.push(selfContact({
      id: `knob:${index}`,
      material: "plastic",
      shape: "cylinder",
      position: [spin(0.17 + index * 0.1, 0.205)[0], knobY, spin(0.17 + index * 0.1, 0.205)[1]],
      rotation: [Math.PI / 2, yaw, 0],
      size: [0.035, 0.025, 0.035],
      color: "#211f1c",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
    }));
  }
  return pieces;
}

/** Кинескопный Sharp 90-х: тёмный пластиковый куб с экраном. */
export function propTvSharp(options: {
  readonly yaw?: number;
} = {}): AppliancePiece[] {
  const yaw = options.yaw ?? 0;
  const spin = spinner(yaw);
  const pieces: AppliancePiece[] = [];

  pieces.push(
    selfContact({
      id: "case",
      material: "plastic",
      shape: "panel",
      position: [0, 0.21, 0],
      rotation: [0, yaw, 0],
      size: [0.4, 0.36, 0.38],
      color: "#3b3a38",
      carriesAttachments: true,
    attachmentSupportMode: "hinge",
      weathering: 0.25,
    }),
    {
      id: "screen",
      material: "darkGlass",
      shape: "glassPane",
      position: [spin(0, 0.175)[0], 0.24, spin(0, 0.175)[1]],
      rotation: [0, yaw, 0],
      size: [0.32, 0.24, 0.035],
      color: "#232a2c",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
      contactBoxes: [{
        position: [spin(0, 0.175)[0], 0.24, spin(0, 0.175)[1]],
        size: [0.32, 0.24, 0.05],
      }],
    },
    selfContact({
      id: "controls",
      material: "plastic",
      shape: "panel",
      position: [spin(0, 0.185)[0], 0.075, spin(0, 0.185)[1]],
      rotation: [0, yaw, 0],
      size: [0.34, 0.05, 0.02],
      color: "#2b2a28",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
    }),
  );
  return pieces;
}

// ---------------------------------------------------------------------------
// Посуда на плиту и стол
// ---------------------------------------------------------------------------

/** Алюминиевый чайник с чёрной кнопкой на крышке. */
export function propKettle(options: {
  readonly scale?: number;
} = {}): AppliancePiece[] {
  const s = options.scale ?? 1;
  return [
    selfContact({
      id: "body",
      material: "steel",
      shape: "cylinder",
      position: [0, 0.1 * s, 0],
      size: [0.24 * s, 0.2 * s, 0.24 * s],
      color: "#b4babc",
      carriesAttachments: true,
    attachmentSupportMode: "hinge",
      weathering: 0.2,
    }),
    selfContact({
      id: "lid",
      material: "steel",
      shape: "cylinder",
      position: [0, 0.225 * s, 0],
      size: [0.09 * s, 0.05 * s, 0.09 * s],
      color: "#22201e",
      bearsLoad: false,
    }),
    selfContact({
      id: "spout",
      material: "steel",
      shape: "cylinder",
      position: [0.14 * s, 0.13 * s, 0],
      rotation: [0, 0, 0.9],
      size: [0.035 * s, 0.12 * s, 0.035 * s],
      color: "#aeb4b6",
      bearsLoad: false,
      sideAttachmentReach: 0.08,
    }),
  ];
}

/** Эмалированная кастрюля: белая или зелёная, с крышкой. */
export function propStewPot(options: {
  readonly scale?: number;
  readonly color?: string;
} = {}): AppliancePiece[] {
  const s = options.scale ?? 1;
  const color = options.color ?? "#3f5c34";
  return [
    selfContact({
      id: "body",
      material: "steel",
      shape: "cylinder",
      position: [0, 0.085 * s, 0],
      size: [0.24 * s, 0.17 * s, 0.24 * s],
      color,
      carriesAttachments: true,
    attachmentSupportMode: "hinge",
      weathering: 0.25,
    }),
    selfContact({
      id: "lid",
      material: "steel",
      shape: "cylinder",
      position: [0, 0.18 * s, 0],
      size: [0.25 * s, 0.02 * s, 0.25 * s],
      color: shade(color, 0.9),
      bearsLoad: false,
    }),
    selfContact({
      id: "lid:knob",
      material: "plastic",
      shape: "cylinder",
      position: [0, 0.205 * s, 0],
      size: [0.045 * s, 0.03 * s, 0.045 * s],
      color: "#26231f",
      bearsLoad: false,
    }),
  ];
}
