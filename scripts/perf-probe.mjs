// Живой замер кадра через CDP: вход в мир на работающем dev-сервере, KeyP,
// съём perf-HUD губернатора. Даёт отпечаток кадра: fps / cpuMs / physicsMs /
// gpuMs / draw calls / triangles. Пара к статическому паспорту
// tests/world-cost-passport.test.mjs: паспорт ловит рост контента на каждом
// прогоне, проба — реальную цену кадра на конкретной машине.
//
//   node scripts/perf-probe.mjs [--world=town] [--world=dutch-polder]
//     [--url=http://localhost:3000] [--samples=20] [--out=perf-probe.json]
//     [--window=1600x900] [--no-gpu]
//
// Чему верить (games/make-a-mess/docs/run-and-verify.md §4): абсолютный FPS в
// headless — сравнительный, не игровой; calls/triangles точны всегда; gpuMs —
// аппаратный таймер, честен при реальном GPU (по умолчанию ANGLE d3d11 на
// Windows; --no-gpu вернёт SwiftShader). Не мерить при параллельной нагрузке:
// сборка, тесты, соседний агент ломают числа.
//
// Сервер скрипт НЕ поднимает и НЕ трогает: он у dev-сервера гость. Профиль
// Chrome — во временном каталоге, убивается только свой PID (гигиена из
// run-and-verify.md §7).

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORLD_ROUTES = {
  town: "/games/make-a-mess",
  "dutch-polder": "/games/make-a-mess/dutch-polder",
  "viking-village": "/games/make-a-mess/viking-village",
  "basalt-stronghold": "/games/make-a-mess/basalt-stronghold",
  "grand-terminal": "/games/make-a-mess/grand-terminal",
  astana: "/games/make-a-mess/astana",
  nimbus: "/games/make-a-mess/nimbus",
  "combat-hexacopter-range": "/games/make-a-mess/combat-hexacopter-range",
};

/** Сколько секунд дать миру осесть после входа, прежде чем верить числам. */
const SETTLE_SECONDS = { town: 15, astana: 18 };
const DEFAULT_SETTLE_SECONDS = 12;

function parseArguments(argv) {
  const options = {
    worlds: [],
    url: "http://localhost:3000",
    samples: 20,
    out: null,
    window: "1600x900",
    gpu: true,
  };
  for (const argument of argv) {
    if (argument.startsWith("--world=")) {
      options.worlds.push(argument.slice("--world=".length));
    } else if (argument.startsWith("--url=")) {
      options.url = argument.slice("--url=".length);
    } else if (argument.startsWith("--samples=")) {
      options.samples = Number(argument.slice("--samples=".length));
    } else if (argument.startsWith("--out=")) {
      options.out = argument.slice("--out=".length);
    } else if (argument.startsWith("--window=")) {
      options.window = argument.slice("--window=".length);
    } else if (argument === "--no-gpu") {
      options.gpu = false;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.worlds.length === 0) {
    options.worlds = ["town", "dutch-polder"];
  }
  for (const world of options.worlds) {
    if (!WORLD_ROUTES[world]) {
      throw new Error(
        `Unknown world "${world}"; known: ${Object.keys(WORLD_ROUTES).join(", ")}`,
      );
    }
  }
  return options;
}

function findChrome() {
  const explicit = process.env.PLAYGATE_CHROME;
  if (explicit && !existsSync(explicit)) {
    throw new Error(`PLAYGATE_CHROME points at a missing file: ${explicit}`);
  }
  if (explicit) return explicit;
  const found = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
  ].filter((candidate) => candidate && existsSync(candidate))[0];
  if (!found) {
    throw new Error("Chrome not found; set PLAYGATE_CHROME to its executable");
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Разбор строки perf-HUD (aside.game-performance) в числа. */
function parseHudText(text) {
  const grab = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1].replace(/[\s,\u00a0]/g, "")) : null;
  };
  return {
    fps: grab(/([\d.]+)\s*FPS/i),
    cpuMs: grab(/CPU\s+([\d.]+)\s*MS/i),
    physicsMs: grab(/PHYSICS\s+([\d.]+)\s*MS/i),
    gpuMs: grab(/GPU\s+([\d.]+)\s*MS/i),
    dpr: grab(/DPR\s+([\d.]+)/i),
    calls: grab(/([\d\s,\u00a0]+)\s*CALLS/i),
    triangles: grab(/([\d\s,\u00a0]+)\s*TRIS/i),
    bodies: grab(/([\d\s,\u00a0]+)\s*BODIES/i),
  };
}

function median(values) {
  const clean = values.filter((value) => value !== null && Number.isFinite(value));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    };
  }

  send(method, params = {}) {
    this.sequence += 1;
    const id = this.sequence;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `page evaluate failed: ${result.exceptionDetails.text} ${JSON.stringify(
          result.exceptionDetails.exception ?? {},
        )}`,
      );
    }
    return result.result.value;
  }

  async key(code, key, keyCode) {
    const base = {
      code,
      key,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }
}

async function connect(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = list.find((target) => target.type === "page");
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.onopen = resolve;
          socket.onerror = () => reject(new Error("CDP websocket failed"));
        });
        return new CdpClient(socket);
      }
    } catch {
      // Chrome ещё поднимается — это ожидание, а не ошибка.
    }
    await sleep(500);
  }
  throw new Error("CDP endpoint never came up");
}

async function measureWorld(cdp, options, world) {
  const url = `${options.url}${WORLD_ROUTES[world]}`;
  process.stderr.write(`== ${world}: ${url}\n`);
  await cdp.send("Page.navigate", { url });

  // Кнопка входа задизейблена, пока собирается сцена — ждать NOT disabled,
  // а не таймаут (run-and-verify.md §2).
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await cdp
      .evaluate(
        `(() => {
          const button = document.querySelector("#enter-game");
          if (!button) return "missing";
          return button.disabled ? "disabled" : "ready";
        })()`,
      )
      .catch(() => "error");
    if (state === "ready") {
      ready = true;
      break;
    }
    await sleep(1000);
  }
  if (!ready) throw new Error(`${world}: enter button never became enabled`);

  // Оверлей ошибки сборки Next закрывает кадр, а игра под ним идёт.
  await cdp.evaluate(
    `document.querySelectorAll("nextjs-portal").forEach((node) => node.remove())`,
  );
  await cdp.evaluate(`document.querySelector("#enter-game").click()`);
  const settleSeconds = SETTLE_SECONDS[world] ?? DEFAULT_SETTLE_SECONDS;
  process.stderr.write(`== ${world}: entered, settling ${settleSeconds}s\n`);
  await sleep(settleSeconds * 1000);

  // KeyP — perf-HUD губернатора.
  await cdp.key("KeyP", "p", 80);
  await sleep(1500);

  const samples = [];
  for (let index = 0; index < options.samples; index += 1) {
    const text = await cdp.evaluate(
      `(() => {
        const hud = document.querySelector(".game-performance");
        return hud ? hud.innerText : null;
      })()`,
    );
    if (text) samples.push(parseHudText(text));
    await sleep(1000);
  }
  if (samples.length === 0) {
    throw new Error(`${world}: perf HUD never appeared (KeyP handled?)`);
  }

  // Хвост выборки: EMA губернатора сходится после входа, голова врёт.
  const tail = samples.slice(Math.floor(samples.length / 2));
  const summary = {};
  for (const metric of [
    "fps",
    "cpuMs",
    "physicsMs",
    "gpuMs",
    "dpr",
    "calls",
    "triangles",
    "bodies",
  ]) {
    summary[metric] = median(tail.map((sample) => sample[metric]));
  }
  return { world, summary, samples };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const chrome = findChrome();
  const port = 9300 + (process.pid % 500);
  const profile = mkdtempSync(join(tmpdir(), "mam-perf-probe-"));
  const [width, height] = options.window.split("x").map(Number);

  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--mute-audio",
    `--window-size=${width},${height}`,
  ];
  if (options.gpu && process.platform === "win32") {
    args.push("--use-angle=d3d11");
  }

  const child = spawn(chrome, [...args, "about:blank"], { stdio: "ignore" });
  const cleanup = () => {
    try {
      child.kill();
    } catch {
      // Уже завершён.
    }
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Windows держит файлы профиля дольше процесса; каталог в tmp.
    }
  };
  process.on("exit", cleanup);

  try {
    const cdp = await connect(port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // Гейт условий до навигации (run-and-verify.md §2); версию читать из
    // app/legal/consent.ts при изменении.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try {
        localStorage["handmade-games:terms-acceptance"] =
          JSON.stringify({ version: "2026-07-24" });
      } catch (error) {}`,
    });

    const results = [];
    for (const world of options.worlds) {
      results.push(await measureWorld(cdp, options, world));
    }

    const report = {
      generatedAt: new Date().toISOString(),
      machine: process.platform,
      window: options.window,
      gpu: options.gpu,
      url: options.url,
      worlds: results,
    };
    if (options.out) {
      writeFileSync(options.out, JSON.stringify(report, null, 2));
      process.stderr.write(`report written to ${options.out}\n`);
    }
    for (const { world, summary } of results) {
      console.log(
        [
          world.padEnd(22),
          `fps ${summary.fps}`,
          `cpu ${summary.cpuMs}ms`,
          `physics ${summary.physicsMs}ms`,
          `gpu ${summary.gpuMs === null ? "n/a" : `${summary.gpuMs}ms`}`,
          `calls ${summary.calls}`,
          `tris ${summary.triangles}`,
        ].join("  "),
      );
    }
  } finally {
    cleanup();
  }
}

await main();
process.exit(0);
