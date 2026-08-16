import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("games/make-a-mess/docs/tilt-hexacopter");
const source = path.join(root, "reference/approved-concept.png");
const evidence = path.join(root, "evidence");
await fs.mkdir(evidence, { recursive: true });

const metadata = await sharp(source).metadata();
if (metadata.width !== 1600 || metadata.height !== 983) {
  throw new Error(`Frozen source changed size: ${metadata.width}x${metadata.height}`);
}

await sharp(source).greyscale().threshold(142).negate().png()
  .toFile(path.join(evidence, "source-silhouette-mask.png"));

const subsystemSvg = `
<svg width="1600" height="983" xmlns="http://www.w3.org/2000/svg">
  <rect width="1600" height="983" fill="#000"/>
  <polygon points="470,855 594,335 775,121 1050,99 1105,310 912,706" fill="#ffffff"/>
  <polygon points="104,485 215,184 592,142 509,742 265,815" fill="#ff4444"/>
  <polygon points="1105,157 1396,162 1510,718 1188,923 1044,671" fill="#ff4444"/>
  <g fill="#55aaff">
    <ellipse cx="380" cy="246" rx="142" ry="80"/><ellipse cx="326" cy="469" rx="150" ry="87"/><ellipse cx="303" cy="682" rx="145" ry="82"/>
    <ellipse cx="1209" cy="277" rx="139" ry="83"/><ellipse cx="1188" cy="496" rx="148" ry="91"/><ellipse cx="1083" cy="745" rx="145" ry="88"/>
  </g>
  <g fill="#ffcc33"><ellipse cx="821" cy="153" rx="87" ry="60"/><ellipse cx="1008" cy="169" rx="88" ry="62"/></g>
</svg>`;
await sharp(Buffer.from(subsystemSvg)).png().toFile(path.join(evidence, "source-subsystem-mask.png"));

const overlaySvg = `
<svg width="1600" height="983" xmlns="http://www.w3.org/2000/svg">
  <style>.a{fill:none;stroke:#ff9b2f;stroke-width:5}.b{fill:#15191c;stroke:#ff9b2f;stroke-width:2}.t{fill:#fff;font:700 24px sans-serif}</style>
  <path class="a" d="M470 855 L594 335 L775 121 L1050 99 L1105 310 L912 706 Z"/>
  <path class="a" d="M104 485 L215 184 L592 142 L509 742 L265 815 Z M1105 157 L1396 162 L1510 718 L1188 923 L1044 671 Z"/>
  <g class="a"><ellipse cx="380" cy="246" rx="142" ry="80"/><ellipse cx="326" cy="469" rx="150" ry="87"/><ellipse cx="303" cy="682" rx="145" ry="82"/><ellipse cx="1209" cy="277" rx="139" ry="83"/><ellipse cx="1188" cy="496" rx="148" ry="91"/><ellipse cx="1083" cy="745" rx="145" ry="88"/></g>
  <rect class="b" x="35" y="32" width="596" height="52" rx="8"/><text class="t" x="55" y="67">FROZEN SOURCE · 6 LIFT DUCTS · 2 UPPER ENGINES</text>
</svg>`;
await sharp(source).composite([{ input: Buffer.from(overlaySvg), blend: "over" }]).png()
  .toFile(path.join(evidence, "source-registration-overlay.png"));
