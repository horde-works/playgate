import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TERMS_VERSION } from "../app/legal/consent.ts";
import { KALLUR_HERO_VIEW } from "../games/make-a-mess/src/content/scenes/kallur/kallurTerrainPlan.ts";

/**
 * Deterministic Kallur frames over CDP (run-and-verify.md §3).
 *
 * Requires a running dev server; set PLAYGATE_DEV_URL (default
 * http://127.0.0.1:3000). Frames land in games/make-a-mess/docs/kallur/frames.
 * The script drives teleport + look, never pilots by hand.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "games/make-a-mess/docs/kallur/frames");
const serverUrl = process.env.PLAYGATE_DEV_URL ?? "http://127.0.0.1:3000";

const FRAMES = [
  {
    id: "hero-01-wall-and-lighthouse",
    position: KALLUR_HERO_VIEW.position,
    lookAt: KALLUR_HERO_VIEW.lookAt,
  },
  {
    id: "saddle-02-lighthouse-hill",
    position: [14, 17.8, 6],
    lookAt: [-13, 21.5, 5],
  },
  {
    id: "crown-03-down-the-island",
    position: [30, 92.5, -56],
    lookAt: [-13, 21, 5],
  },
  {
    id: "coast-04-first-sight",
    position: [-20, 4.6, 86],
    lookAt: [30, 58, -58],
  },
];

function findChrome() {
  let chrome = process.env.PLAYGATE_CHROME;
  if (chrome && !existsSync(chrome)) {
    throw new Error(`PLAYGATE_CHROME points at a missing file: ${chrome}`);
  }
  if (!chrome) {
    chrome = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        : null,
    ].filter((candidate) => candidate && existsSync(candidate))[0];
  }
  if (!chrome) throw new Error("Chrome not found; set PLAYGATE_CHROME to its executable");
  return chrome;
}

async function preflightServer() {
  try {
    const response = await fetch(serverUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok && response.status >= 500) throw new Error(String(response.status));
  } catch (error) {
    throw new Error(
      `Dev server unreachable at ${serverUrl} (${error}). Start next dev first and pass PLAYGATE_DEV_URL.`,
    );
  }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function main() {
  await preflightServer();
  const chrome = findChrome();
  const profile = await mkdtemp(join(tmpdir(), "kallur-capture-"));
  const port = 9300 + (process.pid % 500);
  const child = spawn(chrome, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1830,1000",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    let targets = null;
    for (let attempt = 0; attempt < 60 && !targets; attempt += 1) {
      await sleep(500);
      try {
        const list = await fetch(`http://127.0.0.1:${port}/json/list`);
        targets = await list.json();
      } catch {
        targets = null;
      }
    }
    if (!targets) throw new Error(`CDP endpoint never appeared\n${stderr}`);
    const page = targets.find((target) => target.type === "page");
    if (!page) throw new Error("No page target");

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const { resolve: resolveCall, reject: rejectCall } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rejectCall(new Error(message.error.message));
        else resolveCall(message.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
      const id = nextId++;
      pending.set(id, { resolve: resolveCall, reject: rejectCall });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(`evaluate failed: ${result.exceptionDetails.text} :: ${expression.slice(0, 120)}`);
      }
      return result.result?.value;
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage["handmade-games:terms-acceptance"] = JSON.stringify({ version: ${JSON.stringify(TERMS_VERSION)} });`,
    });
    await send("Page.navigate", { url: `${serverUrl}/games/make-a-mess/kallur` });

    // The scene compiles on the main thread; wait for the real gate, not a timer.
    let ready = false;
    for (let attempt = 0; attempt < 180 && !ready; attempt += 1) {
      await sleep(2000);
      ready = await evaluate(
        "(() => { const b = document.querySelector('#enter-game'); return Boolean(b) && !b.disabled; })()",
      ).catch(() => false);
    }
    if (!ready) throw new Error("#enter-game never became enabled");

    await evaluate("document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()); true");
    await evaluate("document.querySelector('#enter-game').click(); true");

    // The world is ready when its dev hooks exist, not when a timer expires.
    let worldReady = false;
    for (let attempt = 0; attempt < 30 && !worldReady; attempt += 1) {
      await sleep(1000);
      worldReady = await evaluate("typeof window.__mamTeleport === 'function'").catch(() => false);
    }
    if (!worldReady) throw new Error("__mamTeleport never appeared after entering");
    await sleep(2500);

    const pressKey = async (code, keyCode, key) => {
      await send("Input.dispatchKeyEvent", {
        type: "keyDown", code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp", code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
      });
    };
    const debugShot = async (name) => {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      await mkdir(outputRoot, { recursive: true });
      await writeFile(join(outputRoot, name), Buffer.from(shot.data, "base64"));
    };

    await evaluate("document.querySelector('canvas')?.focus(); true");
    let flight = false;
    for (let attempt = 0; attempt < 6 && !flight; attempt += 1) {
      await pressKey("KeyF", 70, "f");
      for (let poll = 0; poll < 8 && !flight; poll += 1) {
        await sleep(500);
        flight = await evaluate("document.body.textContent.includes('FLIGHT')").catch(() => false);
      }
    }
    if (!flight) {
      await debugShot("debug-no-flight.png");
      const hud = await evaluate(
        "document.body.textContent.replace(/\\s+/g, ' ').slice(0, 400)",
      ).catch(() => "<unreadable>");
      throw new Error(`Flight mode did not engage; HUD sample: ${hud}`);
    }

    await mkdir(outputRoot, { recursive: true });
    const manifest = [];
    for (const frame of FRAMES) {
      const [x, y, z] = frame.position;
      const [tx, ty, tz] = frame.lookAt;
      const dx = tx - x;
      const dy = ty - y;
      const dz = tz - z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      await evaluate(`window.__mamTeleport(${x}, ${y}, ${z}); true`);
      await evaluate(`window.__mamLook(${yaw}, ${pitch}); true`);
      await sleep(4500);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      const destination = join(outputRoot, `${frame.id}.png`);
      await writeFile(destination, Buffer.from(shot.data, "base64"));
      manifest.push({ id: frame.id, position: frame.position, lookAt: frame.lookAt, file: `${frame.id}.png` });
      process.stdout.write(`captured ${destination}\n`);
    }
    await writeFile(
      join(outputRoot, "manifest.json"),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), server: serverUrl, frames: manifest }, null, 2)}\n`,
    );
  } finally {
    child.kill();
  }
}

await main();
