// ГДЕ ОКАЗЫВАЕТСЯ ОБЛОМОК, ОТЛОМАННЫЙ У ЛЕТЯЩЕЙ МАШИНЫ.
//
// Болезнь, которую лечили на раннем этапе: кусок появляется в АВТОРСКОЙ точке
// стоянки, а не там, где машина сейчас. Механизм известен — тело обычного
// члена во время рейса никто не пишет, оно стоит дома, и рантайм обязан
// поставить его в текущую позу носителя В МОМЕНТ ОБЛОМА.
//
// Проба: поднять машину, отвести её от стоянки, отломать кусок и спросить
// `__mamDebrisCensus` — он и заведён, чтобы отвечать на это фактом.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { TERMS_VERSION } from "../app/legal/consent.ts";

const PORT = 3000;
const CDP_PORT = 9421;
const BASE = `http://127.0.0.1:${PORT}`;
const SCENE_PATH = "/games/make-a-mess/combat-hexacopter-range";
const argOf=(n,d)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d;};
const CLUSTER = argOf("--cluster","combat-hexacopter-range:vehicle");
const VEHICLE = argOf("--vehicle","combat-hexacopter");
const KIND = argOf("--kind","circuit");


function chromePath() {
  const candidates = [
    process.env.PLAYGATE_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome not found; set PLAYGATE_CHROME");
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      throw new Error(`eval failed: ${result.exceptionDetails.text}`);
    }
    return result.result.value;
  }
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
  const userDataDir = join(process.env.TEMP ?? "/tmp", `playgate-debris-${process.pid}`);
  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--window-size=1280,720",
      "--mute-audio",
      "--use-gl=angle",
      "--enable-unsafe-swiftshader",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let cdp;
  try {
    const page = await waitFor(
      "devtools",
      async () => {
        try {
          const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
          return (await r.json()).find((e) => e.type === "page") ?? null;
        } catch {
          return null;
        }
      },
      { timeout: 60000, every: 300 },
    );
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("handmade-games:terms-acceptance", ${JSON.stringify(
        JSON.stringify({ version: TERMS_VERSION }),
      )}); } catch (e) {}`,
    });
    await fetch(`${BASE}${SCENE_PATH}`).catch(() => {});
    await cdp.send("Page.navigate", { url: `${BASE}${SCENE_PATH}` });
    await waitFor("body", () => cdp.eval("!!document.body"));
    await waitFor(
      "#enter-game",
      () =>
        cdp.eval(
          `(() => { const b = document.querySelector("#enter-game"); return !!b && !b.disabled; })()`,
        ),
      { timeout: 600000, every: 1000 },
    );
    await cdp.eval(`document.querySelector("#enter-game").click()`);
    await waitFor("hooks", () =>
      cdp.eval(
        `typeof window.__mamDebrisCensus === "function" && typeof window.__mamBreakPiece === "function" && typeof window.__mamVehicleDepart === "function"`,
      ),
      { timeout: 300000, every: 1000 },
    );
    await sleep(4000);

    const census = async () =>
      JSON.parse(
        await cdp.eval(
          `JSON.stringify(window.__mamDebrisCensus(${JSON.stringify(CLUSTER)}))`,
        ),
      );

    const before = await census();
    console.log("ДО ВЫЛЕТА  дом:", before.home.map((v) => v.toFixed(1)).join(","),
      "| машина:", before.machine.map((v) => v.toFixed(1)).join(","),
      "| тел дома:", before.memberBodiesAtHome.length,
      "| тел при машине:", before.memberBodiesAtMachine);

    console.log("отправляю в облёт…");
    await cdp.eval(`window.__mamVehicleDepart(${JSON.stringify(VEHICLE)}, ${JSON.stringify(KIND)})`);

    // Ждём, пока машина реально уедет от стоянки.
    const away = await waitFor(
      "carrier away from home",
      async () => {
        const now = await census();
        const d = Math.hypot(
          now.machine[0] - now.home[0],
          now.machine[1] - now.home[1],
          now.machine[2] - now.home[2],
        );
        return d > 25 ? { now, d } : null;
      },
      { timeout: 180000, every: 1000 },
    );
    console.log(`машина ушла на ${away.d.toFixed(1)} м от стоянки`);

    await sleep(4000);
    const now = await census();
    const [mx, my, mz] = now.machine;
    const cam = [mx + 18, my + 4, mz + 18];
    const yaw = Math.atan2(-(mx - cam[0]), -(mz - cam[2]));
    const pitch = Math.atan2(my - cam[1], Math.hypot(mx - cam[0], mz - cam[2]));
    for (const attempt of [0, 1]) {
      await cdp.eval(`window.__mamTeleport(${cam[0]}, ${cam[1]}, ${cam[2]})`);
      await cdp.eval(`window.__mamLook(${yaw}, ${pitch})`);
      if (attempt === 0) await sleep(1500);
    }
    await sleep(1200);
    await cdp.eval(
      `document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()), true`,
    );
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir("playgate-frames/rotor-check", { recursive: true });
    const name = process.argv.includes("--tag")
      ? process.argv[process.argv.indexOf("--tag") + 1]
      : "shot";
    await writeFile(
      `playgate-frames/rotor-check/${name}.png`,
      Buffer.from(shot.data, "base64"),
    );
    console.log("кадр:", `playgate-frames/rotor-check/${name}.png`,
      "| машина:", now.machine.map((v) => v.toFixed(1)).join(","));
  } finally {
    if (cdp) {
      try {
        await cdp.send("Browser.close");
      } catch {}
    }
    chrome.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
