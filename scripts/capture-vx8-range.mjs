// Два кадра VX-8 «Yaqui» на полигоне Tonkawa: на своём паду и в воздухе.
//
// Кадр снимается ТЕЛЕПОРТОМ И НАВОДКОЙ, а не пилотированием: ручной полёт над
// CDP — главный источник потерянного времени (`docs/run-and-verify.md` §3).
// Машину поднимает её собственный автомат по её собственной трассе, а камера
// только смотрит.
//
//   node scripts/capture-vx8-range.mjs [--port 3000] [--out playgate-frames/vx8]
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TERMS_VERSION } from "../app/legal/consent.ts";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const PORT = Number(argOf("--port", "3000"));
const OUT = argOf("--out", "playgate-frames/vx8");
const CDP_PORT = Number(argOf("--cdp", "9377"));
const BASE = `http://127.0.0.1:${PORT}`;
const SCENE_PATH = "/games/make-a-mess/combat-hexacopter-range";
const VEHICLE_ID = "duct-hexacopter";

function chromePath() {
  const explicit = process.env.PLAYGATE_CHROME;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`PLAYGATE_CHROME points at a missing file: ${explicit}`);
    }
    return explicit;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome not found; set PLAYGATE_CHROME");
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Минимальный клиент CDP: в Node 22 есть глобальный WebSocket, пакет `ws` не нужен. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.next = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
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
      this.pending.set(id, { resolve, reject });
      // Сборка сцены ЗАМОРАЖИВАЕТ главный поток на секунды, а в dev — вместе с
      // первой компиляцией маршрута и на десятки. Короткий таймаут здесь читается
      // как «страница мертва» ровно тогда, когда она честно работает.
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 300000);
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
        `eval failed: ${result.exceptionDetails.text} ${
          result.exceptionDetails.exception?.description ?? ""
        }`,
      );
    }
    return result.result.value;
  }
}

/** Наводка на точку: yaw = atan2(−dx, −dz), pitch = atan2(dy, hypot(dx, dz)). */
function aim(from, at) {
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  const dz = at[2] - from[2];
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
}

async function waitFor(label, probe, { timeout = 120000, every = 500 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(every);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const userDataDir = join(
    process.env.TEMP ?? "/tmp",
    `playgate-vx8-${process.pid}`,
  );
  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      // С Chrome 150 свежий профиль виснет на first-run, DevToolsActivePort не
      // появляется и CDP просто не поднимается.
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--window-size=1600,900",
      "--hide-scrollbars",
      "--mute-audio",
      "--use-gl=angle",
      "--enable-unsafe-swiftshader",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  try {
    const target = await waitFor("chrome devtools", async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = await response.json();
        return targets.find((entry) => entry.type === "page") ?? null;
      } catch {
        return null;
      }
    }, { timeout: 60000, every: 300 });

    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Гейт условий кладётся ДО навигации: иначе игра встречает соглашением.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("handmade-games:terms-acceptance", ${JSON.stringify(
        JSON.stringify({ version: TERMS_VERSION }),
      )}); } catch (error) {}`,
    });

    // Прогрев маршрута: в dev первая компиляция страницы идёт десятки секунд, и
    // делать её ВНУТРИ браузера значит смотреть в мёртвый CDP всё это время.
    console.log("warming route…");
    await fetch(`${BASE}${SCENE_PATH}`).catch(() => {});
    console.log("navigating…");

    await cdp.send("Page.navigate", { url: `${BASE}${SCENE_PATH}` });
    await waitFor("page body", () => cdp.eval("!!document.body"));
    console.log("page loaded; waiting for #enter-game…");

    // Кнопка входа задизейблена, пока собирается сцена, и клик по ней молча
    // съедается. Ждём состояния NOT disabled, а не таймаута.
    await waitFor("#enter-game enabled", () =>
      cdp.eval(
        `(() => { const b = document.querySelector("#enter-game"); return !!b && !b.disabled; })()`,
      ),
      { timeout: 240000 },
    );
    console.log("entering the world…");
    await cdp.eval(`document.querySelector("#enter-game").click()`);

    // Оверлей ошибки сборки Next закрывает кадр, а игра под ним идёт.
    const clearOverlay = () =>
      cdp.eval(
        `document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()), true`,
      );

    // Ждём не появления машины в списке, а её ПОЛОЖЕНИЯ: `body` наполняется
    // только после первого тика физики, и снимок без него врёт пустотой.
    const berth = await waitFor("VX-8 resting position", async () => {
      const value = await cdp.eval(
        `(() => {
           if (typeof window.__mamVehicles !== "function") return null;
           const found = window.__mamVehicles().find((v) => v.id === ${JSON.stringify(VEHICLE_ID)});
           if (!found) return null;
           const position = (found.body && found.body.position) || (found.pose && found.pose.position);
           return position ? JSON.stringify(position) : null;
         })()`,
      );
      return value ? JSON.parse(value) : null;
    }, { timeout: 240000 });
    console.log("VX-8 berth:", berth.map((v) => v.toFixed(2)).join(", "));

    // Режим полёта: __mamTeleport не отключает гравитацию, и без него камера
    // падает на палубу вместо того, чтобы стоять там, куда её поставили.
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown", key: "f", code: "KeyF", windowsVirtualKeyCode: 70,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp", key: "f", code: "KeyF", windowsVirtualKeyCode: 70,
    });
    await sleep(600);

    const shoot = async (name, camera, at) => {
      const { yaw, pitch } = aim(camera, at);
      await cdp.eval(`window.__mamTeleport(${camera[0]}, ${camera[1]}, ${camera[2]})`);
      await cdp.eval(`window.__mamLook(${yaw}, ${pitch})`);
      await sleep(1400);
      await clearOverlay();
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: false,
      });
      const file = join(OUT, `${name}.png`);
      await writeFile(file, Buffer.from(shot.data, "base64"));
      console.log("wrote", file);
    };

    // КАДР 1 — машина на своём паду. Камера с юго-востока, чуть выше колец:
    // видно и пад под опорами, и вертипад HX-6 за машиной.
    await shoot(
      "vx8-on-pad",
      [berth[0] + 11, berth[1] + 5.4, berth[2] + 12],
      [berth[0], berth[1] + 1.4, berth[2]],
    );

    // КАДР 2 — машина в воздухе. Поднимает её ЕЁ СОБСТВЕННЫЙ автомат по её
    // собственной трассе: снимать надо то, что машина делает сама.
    const departed = await cdp.eval(
      `window.__mamVehicleDepart(${JSON.stringify(VEHICLE_ID)}, "lap")`,
    );
    console.log("depart accepted:", departed);

    const airborne = await waitFor("VX-8 airborne", async () => {
      const value = await cdp.eval(
        `(() => {
           const found = window.__mamVehicles().find((v) => v.id === ${JSON.stringify(VEHICLE_ID)});
           return found && found.body ? JSON.stringify(found.body.position) : null;
         })()`,
      );
      if (!value) return null;
      const position = JSON.parse(value);
      return position[1] > berth[1] + 9 ? position : null;
    }, { timeout: 180000, every: 700 });

    console.log("VX-8 airborne at:", airborne.map((v) => v.toFixed(2)).join(", "));

    // Камера снаружи круга и чуть выше машины: видно и её, и полигон под ней.
    const outward = Math.hypot(airborne[0], airborne[2]) || 1;
    await shoot(
      "vx8-airborne",
      [
        airborne[0] + (airborne[0] / outward) * 26,
        airborne[1] + 9,
        airborne[2] + (airborne[2] / outward) * 26,
      ],
      airborne,
    );

    const report = {
      scene: SCENE_PATH,
      vehicle: VEHICLE_ID,
      berth,
      airborne,
      capturedAt: new Date().toISOString(),
    };
    await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log("done");
  } finally {
    try { cdp?.socket.close(); } catch {}
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
