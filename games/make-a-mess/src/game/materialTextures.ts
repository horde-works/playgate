import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { litWindowColor, type BreakableMaterial } from "./destructionScene";

const glowMaterials: MeshStandardMaterial[] = [];

// Night-time glow for "lived-in" windows and lamp shades; driven by the
// day/night cycle.
export function setWindowGlow(intensity: number): void {
  for (const material of glowMaterials) {
    material.emissiveIntensity = intensity;
  }
}

const TEXTURE_SIZE = 128;

const textureCache = new Map<BreakableMaterial, CanvasTexture>();
const materialCache = new Map<string, MeshStandardMaterial>();

function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gray(context: CanvasRenderingContext2D, value: number, alpha = 1) {
  const channel = Math.round(Math.min(255, Math.max(0, value)));
  context.fillStyle = `rgba(${channel},${channel},${channel},${alpha})`;
}

function fillNoise(
  context: CanvasRenderingContext2D,
  random: () => number,
  base: number,
  spread: number,
  cell: number,
) {
  for (let y = 0; y < TEXTURE_SIZE; y += cell) {
    for (let x = 0; x < TEXTURE_SIZE; x += cell) {
      gray(context, base + (random() - 0.5) * spread);
      context.fillRect(x, y, cell, cell);
    }
  }
}

function drawMortarBorder(
  context: CanvasRenderingContext2D,
  random: () => number,
  depth: number,
) {
  for (let step = 0; step < depth; step += 1) {
    const shade = 148 - step * 9 + random() * 14;
    gray(context, shade, 0.55);
    context.fillRect(step, step, TEXTURE_SIZE - step * 2, 1.4);
    context.fillRect(
      step,
      TEXTURE_SIZE - step - 1.4,
      TEXTURE_SIZE - step * 2,
      1.4,
    );
    context.fillRect(step, step, 1.4, TEXTURE_SIZE - step * 2);
    context.fillRect(
      TEXTURE_SIZE - step - 1.4,
      step,
      1.4,
      TEXTURE_SIZE - step * 2,
    );
  }
}

function paintMaterial(
  context: CanvasRenderingContext2D,
  material: BreakableMaterial,
) {
  const random = createRandom(material.length * 977 + material.charCodeAt(0));

  switch (material) {
    case "brick": {
      fillNoise(context, random, 205, 44, 4);
      for (let index = 0; index < 9; index += 1) {
        gray(context, 178 + random() * 26, 0.5);
        const y = random() * TEXTURE_SIZE;
        context.fillRect(0, y, TEXTURE_SIZE, 1.5 + random() * 2.5);
      }
      for (let index = 0; index < 26; index += 1) {
        gray(context, 150 + random() * 40, 0.6);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1.5 + random() * 3,
          1.5 + random() * 3,
        );
      }
      drawMortarBorder(context, random, 7);
      break;
    }
    case "stone": {
      fillNoise(context, random, 190, 66, 5);
      for (let index = 0; index < 14; index += 1) {
        gray(context, 150 + random() * 70, 0.4);
        context.beginPath();
        context.ellipse(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          6 + random() * 20,
          4 + random() * 12,
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      drawMortarBorder(context, random, 6);
      break;
    }
    case "concrete": {
      fillNoise(context, random, 195, 34, 4);
      for (let index = 0; index < 60; index += 1) {
        gray(context, 130 + random() * 60, 0.6);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1 + random() * 2,
          1 + random() * 2,
        );
      }
      drawMortarBorder(context, random, 3);
      break;
    }
    case "wood": {
      fillNoise(context, random, 200, 26, 4);
      for (let stripe = 0; stripe < 30; stripe += 1) {
        const y = stripe * (TEXTURE_SIZE / 30) + (random() - 0.5) * 3;
        gray(context, 168 + random() * 56, 0.55);
        context.fillRect(0, y, TEXTURE_SIZE, 1 + random() * 2.4);
      }
      for (let knot = 0; knot < 3; knot += 1) {
        gray(context, 132 + random() * 30, 0.7);
        context.beginPath();
        context.ellipse(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          2.5 + random() * 3,
          5 + random() * 7,
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      break;
    }
    case "plaster": {
      fillNoise(context, random, 228, 20, 3);
      for (let index = 0; index < 12; index += 1) {
        gray(context, 208 + random() * 26, 0.35);
        context.beginPath();
        context.arc(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          8 + random() * 22,
          random() * Math.PI,
          random() * Math.PI + 2,
        );
        context.lineWidth = 1.4;
        context.strokeStyle = context.fillStyle;
        context.stroke();
      }
      break;
    }
    case "steel": {
      fillNoise(context, random, 205, 14, 4);
      for (let x = 0; x < TEXTURE_SIZE; x += 1) {
        const wave = Math.sin((x / TEXTURE_SIZE) * Math.PI * 10);
        gray(context, 196 + wave * 34, 0.75);
        context.fillRect(x, 0, 1, TEXTURE_SIZE);
      }
      for (let index = 0; index < 10; index += 1) {
        gray(context, 165 + random() * 30, 0.4);
        context.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, 2, 2);
      }
      break;
    }
    case "glass": {
      fillNoise(context, random, 246, 8, 8);
      context.lineWidth = 1.2;
      for (let index = 0; index < 5; index += 1) {
        gray(context, 255, 0.5);
        context.strokeStyle = context.fillStyle;
        const offset = random() * TEXTURE_SIZE;
        context.beginPath();
        context.moveTo(offset, 0);
        context.lineTo(offset - TEXTURE_SIZE * 0.5, TEXTURE_SIZE);
        context.stroke();
      }
      break;
    }
    case "asphalt": {
      fillNoise(context, random, 205, 44, 3);
      for (let index = 0; index < 80; index += 1) {
        gray(context, 150 + random() * 60, 0.65);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1 + random() * 1.6,
          1 + random() * 1.6,
        );
      }
      context.lineWidth = 1.1;
      for (let index = 0; index < 3; index += 1) {
        gray(context, 132 + random() * 24, 0.55);
        context.strokeStyle = context.fillStyle;
        context.beginPath();
        let px = random() * TEXTURE_SIZE;
        let py = random() * TEXTURE_SIZE;
        context.moveTo(px, py);
        for (let step = 0; step < 4; step += 1) {
          px += (random() - 0.5) * 46;
          py += (random() - 0.5) * 46;
          context.lineTo(px, py);
        }
        context.stroke();
      }
      break;
    }
    case "soil": {
      fillNoise(context, random, 172, 76, 4);
      for (let index = 0; index < 46; index += 1) {
        gray(context, 96 + random() * 70, 0.65);
        context.beginPath();
        context.arc(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1 + random() * 3.2,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      break;
    }
    default:
      fillNoise(context, random, 210, 30, 4);
  }
}

export function getMaterialTexture(
  material: BreakableMaterial,
): CanvasTexture {
  const cached = textureCache.get(material);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    gray(context, 205);
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    paintMaterial(context, material);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.colorSpace = SRGBColorSpace;
  textureCache.set(material, texture);
  return texture;
}

export function getPieceMaterial(
  material: BreakableMaterial,
  color: string,
): MeshStandardMaterial {
  const key = `${material}:${color}`;
  const cached = materialCache.get(key);
  if (cached) {
    return cached;
  }

  const isGlass = material === "glass";
  const isSteel = material === "steel";
  const standardMaterial = new MeshStandardMaterial({
    color,
    map: getMaterialTexture(material),
    transparent: isGlass,
    opacity: isGlass ? 0.45 : 1,
    depthWrite: !isGlass,
    metalness: isSteel ? 0.78 : 0,
    roughness: isSteel ? 0.34 : isGlass ? 0.16 : material === "wood" ? 0.82 : 0.95,
    envMapIntensity: isSteel ? 1.1 : isGlass ? 1.5 : 0.35,
  });

  if (isGlass && color === litWindowColor) {
    standardMaterial.emissive = new Color("#ffc879");
    standardMaterial.emissiveIntensity = 0;
    glowMaterials.push(standardMaterial);
  }

  materialCache.set(key, standardMaterial);
  return standardMaterial;
}
