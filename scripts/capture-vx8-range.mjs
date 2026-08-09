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
import { DUCT_HEXACOPTER_RANGE_BERTH } from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";

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
      // Сборка этого мира в dev со SwiftShader идёт около ста секунд, а под
      // нагрузкой — заметно дольше. Ждать надо СОСТОЯНИЯ, а не таймаута.
      { timeout: 600000, every: 1000 },
    );
    console.log("entering the world…");
    await cdp.eval(`document.querySelector("#enter-game").click()`);

    // Оверлей ошибки сборки Next закрывает кадр, а игра под ним идёт.
    const clearOverlay = () =>
      cdp.eval(
        `document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()), true`,
      );

    // `body.position` — это НЕ мировая точка, а СМЕЩЕНИЕ от авторского центра
    // масс (`worldCom − mass.centre`). У стоящей машины оно ровно нулевое,
    // поэтому камера, наведённая на него, смотрит в центр мира — то есть на
    // соседнюю машину. Мировая точка собирается из берта и этого смещения.
    const offsetOf = async () => {
      const value = await cdp.eval(
        `(() => {
           if (typeof window.__mamVehicles !== "function") return null;
           const found = window.__mamVehicles().find((v) => v.id === ${JSON.stringify(VEHICLE_ID)});
           return found && found.body ? JSON.stringify(found.body.position) : null;
         })()`,
      );
      return value ? JSON.parse(value) : null;
    };
    const worldPoint = (offset) => [
      DUCT_HEXACOPTER_RANGE_BERTH[0] + offset[0],
      DUCT_HEXACOPTER_RANGE_BERTH[1] + offset[1],
      DUCT_HEXACOPTER_RANGE_BERTH[2] + offset[2],
    ];

    await waitFor("VX-8 body", offsetOf, { timeout: 240000 });
    const berth = worldPoint(await offsetOf());
    console.log("VX-8 berth:", berth.map((v) => v.toFixed(2)).join(", "));

    // Режим полёта: __mamTeleport не отключает гравитацию, и без него камера
    // падает на палубу вместо того, чтобы стоять там, куда её поставили.
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown", key: "f", code: "KeyF", windowsVirtualKeyCode: 70,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp", key: "f", code: "KeyF", windowsVirtualKeyCode: 70,
    });
    // Мир доставляет игрока в свой playerSpawn уже после клика по входу.
    // Съёмка до этого момента снимает точку появления, а не то, что заказано.
    await sleep(6000);

    const shoot = async (name, camera, at, retarget) => {
      const { yaw, pitch } = aim(camera, at);
      // ТЕЛЕПОРТ ПОВТОРЯЕТСЯ НАМЕРЕННО. Сразу после входа в мир игра ещё
      // доставляет игрока в собственный playerSpawn, и одиночный телепорт,
      // отданный раньше этого, молча затирается: кадр тогда снимается от
      // точки появления — то есть с видом на СОСЕДНЮЮ машину.
      for (const attempt of [0, 1]) {
        await cdp.eval(`window.__mamTeleport(${camera[0]}, ${camera[1]}, ${camera[2]})`);
        await cdp.eval(`window.__mamLook(${yaw}, ${pitch})`);
        if (attempt === 0) await sleep(1800);
      }
      await sleep(1400);
      // ЛЕТЯЩАЯ МАШИНА УЕЗЖАЕТ ИЗ ПРИЦЕЛА, ПОКА КАМЕРА ВСТАЁТ. На круге она
      // идёт около одиннадцати метров в секунду, то есть за постановку камеры
      // уходит метров на тридцать: наводка, снятая до телепорта, показывает
      // пустое небо рядом с машиной. Досняли — перенаводимся по живой точке.
      if (retarget) {
        // Перенаводка тоже С УПРЕЖДЕНИЕМ: между командой взгляда и затвором
        // проходят сотни миллисекунд, и машина, идущая сорок километров в час,
        // успевает уйти к краю кадра. Скорость снимаем прямо здесь, двумя
        // замерами, и целимся туда, где машина будет в момент снимка.
        const first = await retarget();
        await sleep(250);
        const second = await retarget();
        if (second) {
          const SHUTTER_SECONDS = 0.45;
          const led = first
            ? second.map(
                (value, axis) =>
                  value + ((value - first[axis]) / 0.25) * SHUTTER_SECONDS,
              )
            : second;
          const corrected = aim(camera, led);
          await cdp.eval(`window.__mamLook(${corrected.yaw}, ${corrected.pitch})`);
          await sleep(120);
        }
      }
      await clearOverlay();
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: false,
      });
      const file = join(OUT, `${name}.png`);
      await writeFile(file, Buffer.from(shot.data, "base64"));
      console.log("wrote", file);
    };

    // Телеметрия наводится прицелом, но кадр снимается телепортом, поэтому
    // машину выбираем принудительно: иначе панель молчит и кадр не называет
    // того, кого показывает.
    await cdp.eval(
      `window.__mamVehicleSelect(${JSON.stringify(
        "combat-hexacopter-range:duct-vehicle",
      )})`,
    );

    // КАДР 1 — машина НА СВОИХ ОПОРАХ. Камера низкая и близкая: с высоты
    // видно машину, но не видно, стоит она или висит, а весь вопрос кадра
    // именно в этом — опоры должны касаться пада.
    await shoot(
      "vx8-on-pad",
      [berth[0] + 9.5, berth[1] + 2.2, berth[2] + 10.5],
      [berth[0], berth[1] + 1.2, berth[2]],
    );

    // КАДР 2 — машина в воздухе. Поднимает её ЕЁ СОБСТВЕННЫЙ автомат по её
    // собственной трассе: снимать надо то, что машина делает сама.
    const departed = await cdp.eval(
      `window.__mamVehicleDepart(${JSON.stringify(VEHICLE_ID)}, "lap")`,
    );
    console.log("depart accepted:", departed);

    // Ждём не «оторвалась», а «идёт по кругу»: машина, висящая над собственным
    // падом, — это ещё взлёт, а кадр обещан НАД ПОЛИГОНОМ. Условие двойное —
    // вышла на эшелон и ушла от берта по горизонтали.
    const airborne = await waitFor("VX-8 on the lap", async () => {
      const offset = await offsetOf();
      if (!offset) return null;
      const along = Math.hypot(offset[0], offset[2]);
      return offset[1] > 15 && along > 20 ? worldPoint(offset) : null;
    }, { timeout: 300000, every: 700 });

    console.log("VX-8 airborne at:", airborne.map((v) => v.toFixed(2)).join(", "));

    // Камера снаружи круга и чуть выше машины: видно и её, и полигон под ней.
    // Ближе, чем хочется «для композиции»: на кадре обязана читаться САМА
    // МАШИНА — шесть колец и застеклённая кабина, — иначе кадр доказывает
    // только то, что в небе что-то есть.
    // Упреждение: ставим камеру не туда, где машина сейчас, а туда, где она
    // будет, когда камера встанет. Скорость снимается двумя замерами живой
    // точки, а не берётся из паспорта: по дуге путевая меньше предельной.
    const before = await offsetOf();
    await sleep(700);
    const after = await offsetOf();
    const SETTLE_SECONDS = 3.6;
    const lead = worldPoint([
      after[0] + ((after[0] - before[0]) / 0.7) * SETTLE_SECONDS,
      after[1] + ((after[1] - before[1]) / 0.7) * SETTLE_SECONDS,
      after[2] + ((after[2] - before[2]) / 0.7) * SETTLE_SECONDS,
    ]);
    const outward = Math.hypot(lead[0], lead[2]) || 1;
    await shoot(
      "vx8-airborne",
      [
        lead[0] + (lead[0] / outward) * 17,
        lead[1] + 5.5,
        lead[2] + (lead[2] / outward) * 17,
      ],
      lead,
      async () => {
        const offset = await offsetOf();
        return offset ? worldPoint(offset) : null;
      },
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
