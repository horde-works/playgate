// World-context proof for the owner-accepted D02 Palace of Virgin Lands.
//
//   node scripts/capture-astana-virgin-lands-palace.mjs --port 3001
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TERMS_VERSION } from "../app/legal/consent.ts";
import {
  KHAN_SHATYR_CENTRE,
  NUR_ALEM_CENTRE,
  PYRAMID_CENTRE,
  VIRGIN_LANDS_PALACE_CENTRE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const port = Number(argOf("--port", "3000"));
const cdpPort = Number(argOf("--cdp", "9382"));
const output = argOf(
  "--out",
  "games/make-a-mess/docs/virgin-lands-palace/world-d02",
);
const onlyShot = argOf("--only", "");
const base = `http://127.0.0.1:${port}`;
const route = "/games/make-a-mess/astana";

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
      throw new Error(result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text);
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

function approachShot(name, centre, radialDistance, tangentDistance, height, targetY) {
  const length = Math.hypot(...centre);
  const radial = [centre[0] / length, centre[1] / length];
  const tangent = [-radial[1], radial[0]];
  return {
    name,
    camera: [
      centre[0] - radial[0] * radialDistance + tangent[0] * tangentDistance,
      height,
      centre[1] - radial[1] * radialDistance + tangent[1] * tangentDistance,
    ],
    target: [centre[0], targetY, centre[1]],
  };
}

await mkdir(output, { recursive: true });
const profile = join(process.env.TEMP ?? "/tmp", `playgate-palace-${process.pid}`);
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
  await sleep(6000);
  await waitFor("world camera hooks", () => cdp.eval(
    `typeof window.__mamTeleport === "function"
      && typeof window.__mamLook === "function"`,
  ));

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

  const shots = [
    approachShot("palace-front-arrival", VIRGIN_LANDS_PALACE_CENTRE,
      47, 0, 27, 5.5),
    approachShot("palace-front-right", VIRGIN_LANDS_PALACE_CENTRE,
      35, 30, 25, 5.8),
    approachShot("palace-peninsula-context", VIRGIN_LANDS_PALACE_CENTRE,
      18, 29, 23, 4.8),
    approachShot("khan-peninsula-approach", KHAN_SHATYR_CENTRE,
      62, -25, 32, 13),
    approachShot("pyramid-peninsula-approach", PYRAMID_CENTRE,
      48, 24, 28, 10),
    approachShot("pyramid-close", PYRAMID_CENTRE,
      36, 8, 13, 9),
    approachShot("expo-peninsula-approach", NUR_ALEM_CENTRE,
      58, -28, 34, 13),
    {
      name: "four-peninsulas-overview",
      camera: [0, 250, 0.01],
      target: [0, 0, 0],
    },
    {
      name: "four-peninsulas-oblique",
      camera: [20, 185, 225],
      target: [0, 2, 0],
    },
  ].filter((shot) => !onlyShot || shot.name === onlyShot);

  if (shots.length === 0) {
    throw new Error(`Unknown shot: ${onlyShot}`);
  }

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
