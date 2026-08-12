import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTITUDE_RESPONSE_FLOOR,
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  advanceVehicleFailureWatchdog,
  createVehicleFailureWatchdog,
  vehicleAttitudeCritical,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";

/**
 * ПРИЧИНА СНАРУЖИ ИЛИ ВНУТРИ — ЭТО РАЗНЫЕ ДИАГНОЗЫ.
 *
 * Вердикт Igor (12.08.2026), с которого написан этот файл: «с одной стороны
 * машина не вполне слушается управления, с другой — причина снаружи, а не
 * внутри, и это нужно различать». И рядом — про позу: «машине реально плевать
 * как ей летать, она робот; если перевернулась и упала — автомат выводит её из
 * соответствующей позиции, если органы управления исправны и откликаются
 * манёвром».
 *
 * Оба правила про одно: СИМПТОМ НЕ ЕСТЬ ПРИЧИНА. Перевёрнутая машина и
 * сломанная машина выглядят одинаково; зацепившаяся и потерявшая управление —
 * тоже. Сторож, который сваливает их в один отказ, лечит не то и, хуже,
 * лишает машину выхода, который у неё физически был.
 */

/** Наблюдение, в котором всё в порядке. Тесты портят ровно по одному полю. */
function healthy(overrides = {}) {
  return {
    deltaSeconds: 0.5,
    relativeAltitude: 40,
    pitch: 0,
    roll: 0,
    headingError: 0,
    yawRateError: 0,
    crossTrackError: 0,
    altitudeError: 0,
    progress: 0.5,
    routeProgressTracked: false,
    requiredControlAvailable: true,
    requestedControlEffort: 0,
    deliveredControlFraction: 1,
    goArounds: 0,
    corrections: 0,
    turning: false,
    inFinalManeuver: false,
    dockingDistance: 0,
    inDockingCapture: false,
    dockingComplete: false,
    ...overrides,
  };
}

/** Прогнать сторожа `seconds` секунд с одним и тем же наблюдением. */
function hold(observation, seconds) {
  let state = createVehicleFailureWatchdog(observation.progress ?? 0.5);
  let failure = null;
  for (let elapsed = 0; elapsed < seconds; elapsed += observation.deltaSeconds) {
    const result = advanceVehicleFailureWatchdog(state, observation);
    state = result.state;
    if (result.failure && !failure) {
      failure = result.failure;
    }
  }
  return { state, failure };
}

const UPSIDE_DOWN = Math.PI * 0.95;

test("ПОЗА — ПРЕДПОЧТЕНИЕ: откликающаяся машина не объявляется аварийной вверх ногами", () => {
  // Та же поза, тот же конверт, разный ответ — и разница ровно в том, слушает
  // ли машина управление.
  assert.equal(
    vehicleAttitudeCritical({
      pitch: 0,
      roll: UPSIDE_DOWN,
      yawRateError: 0,
      responding: 1,
    }),
    false,
    "перевёрнутая, но управляемая машина снята с рейса",
  );
  assert.equal(
    vehicleAttitudeCritical({ pitch: 0, roll: UPSIDE_DOWN, yawRateError: 0 }),
    true,
    "перевёрнутая и неуправляемая машина осталась в строю",
  );
});

test("порог отклика — половина заказанного, и он не на глаз", () => {
  // Ниже порога машина уже не доворачивается, а держится за нынешний угол:
  // это и есть потеря позы. Проверяется обе стороны порога, чтобы правило не
  // сползло молча.
  const just = { pitch: 0, roll: UPSIDE_DOWN, yawRateError: 0 };
  assert.equal(
    vehicleAttitudeCritical({
      ...just,
      responding: ATTITUDE_RESPONSE_FLOOR + 0.01,
    }),
    false,
  );
  assert.equal(
    vehicleAttitudeCritical({
      ...just,
      responding: ATTITUDE_RESPONSE_FLOOR - 0.01,
    }),
    true,
  );
});

test("отклик не отменяет ЗАКЛИНИВШЕГО РЫСКАНИЯ — это про орган, а не про позу", () => {
  // Граница послабления. Расхождение темпа рыскания у невращающейся машины —
  // признак заклинившего канала; позой его не оправдать, сколько бы машина ни
  // откликалась по тангажу и крену.
  assert.equal(
    vehicleAttitudeCritical({
      pitch: 0,
      roll: 0,
      yawRateError: Math.PI * 0.5,
      responding: 1,
    }),
    true,
  );
});

/** Симптомы, одинаковые у поломки и у зацепа: заказали — не получили. */
const NOT_OBEYING = {
  requestedControlEffort: 1,
  deliveredControlFraction: 0,
  pitch: UPSIDE_DOWN,
  roll: 0,
  yawRateError: Math.PI,
};

test("ЗАЦЕП НЕ ЕСТЬ ПОЛОМКА: та же картина получает другое имя", () => {
  const envelope = DEFAULT_VEHICLE_FAILURE_ENVELOPE;
  const inside = hold(healthy(NOT_OBEYING), 6);
  // Именно `controlMismatch`, а не `criticalAttitude`: у машины разом обе
  // беды, и первым срабатывает более короткий срок — две секунды против трёх.
  // Порядок здесь не случайность, а смысл: «не слушается» точнее описывает
  // причину, чем «лежит на боку», и приходит раньше.
  assert.equal(
    inside.failure,
    "controlMismatch",
    "неуправляемая машина обязана быть снята с рейса",
  );

  // То же самое, но машину держит чужое тело. Диагноз обязан быть другим —
  // и НЕ РАНЬШЕ, чем истечёт срок на высвобождение.
  const outside = hold(healthy({ ...NOT_OBEYING, externallyHeld: true }), 6);
  assert.equal(outside.failure, null, "помеха снаружи объявлена поломкой");
  assert.ok(
    outside.state.controlMismatchSeconds === 0 &&
      outside.state.attitudeSeconds === 0,
    "внутренние таймеры сторожа шли, пока причина была снаружи",
  );
  assert.ok(
    outside.state.entangledSeconds >= 5.5,
    `срок высвобождения не идёт: ${outside.state.entangledSeconds}`,
  );
  assert.ok(
    envelope.entanglementGraceSeconds > envelope.controlMismatchGraceSeconds,
    "на высвобождение дано не больше, чем на поломку",
  );
});

test("но и вечно висеть в чужом теле нельзя — у зацепа свой срок", () => {
  const stuck = hold(healthy({ ...NOT_OBEYING, externallyHeld: true }), 20);
  assert.equal(stuck.failure, "entangled");
});

test("освободилась — срок высвобождения обнуляется", () => {
  // Раскачка не обязана быть монотонной: машина выходит из зацепа рывками, и
  // накопленный срок не должен переживать освобождение.
  let state = createVehicleFailureWatchdog(0.5);
  for (let step = 0; step < 16; step += 1) {
    state = advanceVehicleFailureWatchdog(
      state,
      healthy({ ...NOT_OBEYING, externallyHeld: true }),
    ).state;
  }
  assert.ok(state.entangledSeconds > 7);
  const freed = advanceVehicleFailureWatchdog(state, healthy()).state;
  assert.equal(freed.entangledSeconds, 0);
});

test("зацеп не прячет ОТОРВАННЫЙ орган: канала нет — это внутри", () => {
  // Граница послабления с другой стороны. Отсутствие обязательного канала
  // управления — факт о самой машине, и он остаётся приговором даже пока её
  // держат снаружи; иначе достаточно было бы задеть мачту, чтобы разобранная
  // машина продолжала числиться исправной.
  //
  // ЗАМЕР ЧЕСТНО ГОВОРИТ, ЧТО ЭТОГО СЕЙЧАС НЕ ПРОИСХОДИТ: сторож снимает с
  // рейса `requiredControlAvailable: false` ТОЛЬКО через таймер
  // `controlMismatch`, а тот при внешней помехе стоит. Отказ приходит по
  // сроку зацепа и называется `entangled`.
  const gone = hold(
    healthy({
      externallyHeld: true,
      requiredControlAvailable: false,
      requestedControlEffort: 1,
      deliveredControlFraction: 0,
    }),
    20,
  );
  assert.equal(
    gone.failure,
    "entangled",
    "разобранная и зацепившаяся машина получила неожиданный диагноз",
  );
  // Разница с целой машиной — во времени: своя поломка снимает за две
  // секунды, зацеп даёт двенадцать. Это и есть цена ошибки в пользу машины.
  const own = hold(
    healthy({
      requiredControlAvailable: false,
      requestedControlEffort: 1,
      deliveredControlFraction: 0,
    }),
    20,
  );
  assert.equal(own.failure, "controlMismatch");
});
