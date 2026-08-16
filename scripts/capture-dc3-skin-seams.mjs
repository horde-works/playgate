// Мировые кадры клёпаной обшивки DC-3 (профиль `alclad-riveted`).
//
// Кадры снимаются В МИРЕ, а не в Object Lab: лаборатория считает свои
// `materialOverrides` и шейдерной ветки обшивки не запускает — клёпку там
// не увидеть в принципе.
//
// Четыре дистанции — потому что решётка проверяется не наличием, а
// поведением на удалении: вблизи должна читаться заклёпка, издали —
// гаснуть в ровный сатин, а не в муар.
//
//   node scripts/capture-dc3-skin-seams.mjs --port 3000
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TERMS_VERSION } from "../app/legal/consent.ts";
import { ISLAND_AIRPORT_DC3_PLACEMENT } from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const port = Number(argOf("--port", "3000"));
const cdpPort = Number(argOf("--cdp", String(9300 + (process.pid % 500))));
const output = argOf("--out", "games/make-a-mess/docs/dc-3/skin-seams");
const onlyShot = argOf("--only", "");
const base = `http://127.0.0.1:${port}`;
const route = "/games/make-a-mess/island-airport";

function chromePath() {
  const candidates = [
    process.env.PLAYGATE_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome not found; set PLAYGATE_CHROME");
  return found;
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.next = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 300000);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description
          ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }
}

async function waitFor(label, probe, timeout = 600000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(750);
  }
}

function aim(from, target) {
  const dx = target[0] - from[0];
  const dy = target[1] - from[1];
  const dz = target[2] - from[2];
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
}

/**
 * Точка машины в мире. Авторский нос смотрит в +Z, стоянка развёрнута на
 * yaw = π/2, поэтому объектный +Z уходит в мировой +X, а объектный +X —
 * в мировой −Z. Считать это в уме на каждом кадре — способ промахнуться.
 */
function onAirframe([ox, oy, oz]) {
  const { position, yaw } = ISLAND_AIRPORT_DC3_PLACEMENT;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return [
    position[0] + ox * cos + oz * sin,
    position[1] + oy,
    position[2] - ox * sin + oz * cos,
  ];
}

// Все точки — в объектных координатах машины: нос +Z, левый борт −X.
const SHOTS = [
  {
    // Борт в упор: заклёпка обязана читаться головкой с тенью рядом.
    name: "skin-rivet-close",
    camera: onAirframe([-3.6, 2.7, -4]),
    target: onAirframe([-1.2, 2.5, -4]),
  },
  {
    // Кабинный отсек с трёх метров: ряды и нахлёсты как рисунок, не как шум.
    name: "skin-cabin-quarter",
    camera: onAirframe([-6.5, 4.2, 2.5]),
    target: onAirframe([-1.0, 2.4, -2.0]),
  },
  {
    // Крыло сверху-сбоку: полосы обязаны идти вдоль размаха, а не поперёк.
    name: "skin-wing-upper",
    camera: onAirframe([9.0, 7.5, 3.0]),
    target: onAirframe([7.5, 3.3, -1.3]),
  },
  {
    // Профиль целиком, 26 м: рисунок ещё жив, но уже не спорит с силуэтом.
    // Съёмка с ЮГА: севернее полосы стоит ограда и командный пункт, и камера
    // там упирается в них с трёх метров вместо машины.
    name: "skin-side-profile",
    camera: onAirframe([26, 6.0, -2.0]),
    target: onAirframe([0, 2.6, -2.0]),
  },
  {
    // 45 м: гейт по производной обязан погасить решётку в ровный сатин.
    name: "skin-far-moire",
    camera: onAirframe([40, 12.0, 18.0]),
    target: onAirframe([0, 2.6, -2.0]),
  },
];

await mkdir(output, { recursive: true });
const profile = join(
  process.env.TMPDIR ?? "/tmp",
  `playgate-dc3-skin-${process.pid}`,
);
const chrome = spawn(chromePath(), [
  "--headless=new",
  `--remote-debugging-port=${cdpPort}`,
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  "--window-size=1600,1000",
  "--hide-scrollbars",
  "--mute-audio",
  "--use-gl=angle",
  "--enable-unsafe-swiftshader",
  "about:blank",
], { stdio: "ignore" });

let cdp;
try {
  const target = await waitFor("Chrome DevTools", async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      return targets.find((entry) => entry.type === "page") ?? null;
    } catch {
      return null;
    }
  }, 60000);
  cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("handmade-games:terms-acceptance", ${JSON.stringify(
      JSON.stringify({ version: TERMS_VERSION }),
    )})`,
  });

  await fetch(`${base}${route}`).catch(() => {});
  await cdp.send("Page.navigate", { url: `${base}${route}` });
  await waitFor("enabled world entrance", () => cdp.eval(
    `(() => { const button = document.querySelector("#enter-game");
      return !!button && !button.disabled; })()`,
  ));
  await cdp.eval(`document.querySelector("#enter-game").click()`);
  await sleep(8000);
  await waitFor("world camera hooks", () => cdp.eval(
    `typeof window.__mamTeleport === "function"
      && typeof window.__mamLook === "function"`,
  ));

  // Без режима полёта телепорт роняет тело на бетон, и весь набор снимается
  // с уровня земли.
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "f", code: "KeyF", windowsVirtualKeyCode: 70,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "f", code: "KeyF", windowsVirtualKeyCode: 70,
  });
  await sleep(1500);
  await cdp.eval(`(() => {
    const style = document.createElement("style");
    style.textContent = ".play-topbar,.game-objective,.game-action-hint,.controls-hint,.mode-chips,.crosshair,.frame-caption-slot{display:none!important}";
    document.head.appendChild(style);
    return true;
  })()`);

  const shots = SHOTS.filter((shot) => !onlyShot || shot.name === onlyShot);
  if (shots.length === 0) throw new Error(`Unknown shot: ${onlyShot}`);

  for (const shot of shots) {
    const look = aim(shot.camera, shot.target);
    for (const attempt of [0, 1]) {
      await cdp.eval(
        `window.__mamTeleport(${shot.camera[0]},${shot.camera[1]},${shot.camera[2]})`,
      );
      await cdp.eval(`window.__mamLook(${look.yaw},${look.pitch})`);
      if (attempt === 0) await sleep(1500);
    }
    await sleep(1200);
    await cdp.eval(
      `document.querySelectorAll("nextjs-portal").forEach((node) => node.remove())`,
    );
    const image = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const file = join(output, `${shot.name}.png`);
    await writeFile(file, Buffer.from(image.data, "base64"));
    console.log(file);
  }
} finally {
  cdp?.socket.close();
  chrome.kill("SIGTERM");
}
