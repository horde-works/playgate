/**
 * ГЕНЕРАТОР АЛЬФА-МАСКИ ТИТУЛОВ DC-3 «CROSSTOWN AIRWAYS».
 *
 * Паспорт — games/make-a-mess/docs/dc-3/livery-crosstown-p01.md. Белые глифы
 * на прозрачном фоне; цвет эмали живёт на куске, не здесь. PNG закоммичен как
 * ассет, этот скрипт — его происхождение: перегенерация нужна только при
 * смене текста, пояса или кегля, и требует машины со шрифтом Helvetica.
 *
 *   node tools/dc3-livery-titles-texture.mjs
 *
 * Раскладка повторяет закон face-fit: u — вдоль пояса (0 у носового конца на
 * правом борту и у кормового на левом — текст отцентрован, поэтому борта
 * симметричны), v — от низа пояса к верху; строка canvas 0 — ВЕРХ пояса.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  DC3_LIVERY_BAND,
  DC3_LIVERY_BASELINE_Y,
  DC3_LIVERY_CAP_HEIGHT,
  DC3_LIVERY_TITLE_TEXT,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3LiveryTitles.ts";

const WIDTH = 4096;
/** Высота капители Helvetica — 0.717 em. */
const HELVETICA_CAP_PER_EM = 0.717;
/** Трекинг 60-х: разреженные капительные титулы. */
const TRACKING_EM = 0.1;

const bandLength = DC3_LIVERY_BAND.zFore - DC3_LIVERY_BAND.zAft;
const bandHeight = DC3_LIVERY_BAND.yTop - DC3_LIVERY_BAND.yBottom;
const height = Math.round((WIDTH * bandHeight) / bandLength);
const pxPerMetre = WIDTH / bandLength;

const capPx = DC3_LIVERY_CAP_HEIGHT * pxPerMetre;
const fontPx = capPx / HELVETICA_CAP_PER_EM;
const baselineV =
  (DC3_LIVERY_BASELINE_Y - DC3_LIVERY_BAND.yBottom) / bandHeight;
const baselinePx = Math.round((1 - baselineV) * height);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}">
  <text
    x="${WIDTH / 2}"
    y="${baselinePx}"
    text-anchor="middle"
    font-family="Helvetica"
    font-weight="bold"
    font-size="${fontPx.toFixed(1)}"
    letter-spacing="${(fontPx * TRACKING_EM).toFixed(1)}"
    fill="#ffffff"
  >${DC3_LIVERY_TITLE_TEXT}</text>
</svg>`;

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "games",
  "make-a-mess",
  "textures",
  "dc3-livery-titles.png",
);

const image = await sharp(Buffer.from(svg)).png().toFile(target);
console.log(
  `dc3-livery-titles.png: ${image.width}x${image.height}, ` +
    `капитель ${capPx.toFixed(0)} px (${DC3_LIVERY_CAP_HEIGHT} м), ` +
    `базовая линия y=${baselinePx} px`,
);
