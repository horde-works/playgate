"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLanguage } from "../i18n/LanguageProvider";
import {
  WORLD_BOOT_TIMEOUT_MS,
  abandonWorldBoot,
  getServerWorldBootState,
  getWorldBootState,
  subscribeWorldBoot,
  worldBootCopyKey,
  worldBootPlan,
} from "./worldBoot";

/** Сколько отчёт растворяется после закрытия шкалы. Держится в паре с CSS. */
const FADE_OUT_MS = 420;

/**
 * Единственный экран ожидания на весь путь «выбрал мир → мир виден».
 *
 * Живёт в корневой раскладке, а не на странице, потому что путь пересекает
 * границу маршрута: просьбу подаёт каталог, вехи присылает мир, а между ними
 * дерево страницы меняется целиком. Отчёт же обязан быть непрерывным — иначе
 * на самом длинном месте ожидания он мигнёт и начнётся заново.
 *
 * Цвет фона тот же, что у .play-page и заслонки: переход от каталога к миру
 * идёт через одну и ту же темноту, без вспышки промежуточного кадра.
 */
export function WorldBootOverlay() {
  const { t } = useLanguage();
  const state = useSyncExternalStore(
    subscribeWorldBoot,
    getWorldBootState,
    getServerWorldBootState,
  );
  const plan = worldBootPlan(state);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  // Полоса — внешняя система, а не состояние React: её ведёт композитор, и
  // единственное, что здесь нужно, — вовремя отдать ему цель. Каждое следующее
  // присвоение подхватывает полосу с того места, где она сейчас.
  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) {
      return;
    }
    // Ноль пишется явно, а не берётся из таблицы стилей. У перехода должно
    // быть определённое начало: без него браузер считает начальным то, что
    // получилось само, — а это полная шкала, и полоса открывается заполненной
    // и УБЫВАЕТ до цели. Наблюдалось ровно так.
    if (!started.current) {
      started.current = true;
      fill.style.transitionDuration = "0ms";
      fill.style.transform = "scaleX(0)";
    }
    // Чтение геометрии закрывает предыдущее значение: без него браузер вправе
    // слить оба присвоения в одно и показать прыжок вместо хода.
    void fill.offsetWidth;
    fill.style.transitionDuration = `${plan.approachMs}ms`;
    fill.style.transform = `scaleX(${plan.target})`;
  }, [plan.approachMs, plan.target]);

  // Отчёт может сняться и появиться снова (следующий мир): полоса обязана
  // начать с нуля, а не с того места, где её застало прошлое ожидание.
  useEffect(() => {
    if (!plan.visible) {
      started.current = false;
    }
  }, [plan.visible]);

  // Отчёт снимается не мгновенно: шкала должна успеть закрыться, а темнота —
  // разойтись.
  useEffect(() => {
    if (!plan.settled) {
      return;
    }
    const timer = window.setTimeout(abandonWorldBoot, FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [plan.settled]);

  // Зависшая загрузка обязана закончиться обычным экраном, а не вечной
  // полосой: если мир не собрался за дедлайн, отчёт уходит и открывает то,
  // что под ним, — карточку запуска или каталог, из которого пришли.
  useEffect(() => {
    if (!plan.visible || plan.settled) {
      return;
    }
    const timer = window.setTimeout(abandonWorldBoot, WORLD_BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [plan.visible, plan.settled]);

  // «Назад» отменяет вход: мир, которого никто больше не ждёт, не имеет права
  // держать экран.
  useEffect(() => {
    if (!plan.visible) {
      return;
    }
    window.addEventListener("popstate", abandonWorldBoot);
    return () => window.removeEventListener("popstate", abandonWorldBoot);
  }, [plan.visible]);

  if (!plan.visible) {
    return null;
  }

  return (
    <div
      className={`world-boot${plan.settled ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="world-boot-card">
        <p className="world-boot-kicker">{state.world ?? t("boot.kicker")}</p>
        <p className="world-boot-title">{t(worldBootCopyKey(plan.phase))}</p>
        <div className="world-boot-meter">
          <div className="world-boot-track">
            <span ref={fillRef} className="world-boot-fill">
              {/* Проблеск ведёт композитор: пока главный поток занят сборкой
                  мира, это единственное движение, которое вообще возможно, — и
                  единственное доказательство, что машина работает. */}
              <span className="world-boot-sweep" aria-hidden="true" />
            </span>
          </div>
          <span className="world-boot-step">
            {String(plan.step).padStart(2, "0")} /{" "}
            {String(plan.stepCount).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
