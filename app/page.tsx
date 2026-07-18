import type { Metadata } from "next";
import Link from "next/link";
import { GameCard } from "./components/GameCard";
import { SiteHeader } from "./components/SiteHeader";
import { featuredGame } from "../games/registry";

export const metadata: Metadata = {
  title: "Игры, которые мы делаем сами",
  description:
    "Небольшая домашняя коллекция рукотворных игр. Начинаем с Make a Mess.",
};

export default function Home() {
  return (
    <main className="site-shell">
      <SiteHeader />

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            Домашняя игровая лаборатория
          </p>
          <h1 id="hero-title">
            Игры, которые
            <span>мы делаем сами.</span>
          </h1>
          <p className="hero-lede">
            Без магазина, рекламы и бесконечного прогресса. Просто берём идею,
            собираем её руками и смотрим, во что хочется играть ещё раз.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href={featuredGame.href}>
              Открыть Make a Mess
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" href="/games">
              Смотреть каталог
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="hero-art" aria-label="Разлетающаяся стена из блоков">
          <div className="hero-label hero-label-top">BUILD / BREAK / REPEAT</div>
          <div className="impact-ring" />
          <div className="impact-core" />
          <div className="brick brick-1" />
          <div className="brick brick-2" />
          <div className="brick brick-3" />
          <div className="brick brick-4" />
          <div className="brick brick-5" />
          <div className="brick brick-6" />
          <div className="brick brick-7" />
          <div className="brick brick-8" />
          <div className="brick brick-9" />
          <div className="dust dust-1" />
          <div className="dust dust-2" />
          <div className="dust dust-3" />
          <div className="hero-label hero-label-bottom">PROTOTYPE 001</div>
        </div>
      </section>

      <section className="featured-section" aria-labelledby="featured-title">
        <div className="section-heading">
          <div>
            <p className="section-index">01 / Сейчас строим</p>
            <h2 id="featured-title">Первый эксперимент</h2>
          </div>
          <p>
            Небольшое пространство, где каждая вещь знает, из чего она сделана,
            на чём держится и как должна сломаться.
          </p>
        </div>
        <GameCard game={featuredGame} featured />
      </section>

      <section className="principles" id="about" aria-labelledby="about-title">
        <div className="principles-intro">
          <p className="section-index">Как мы это делаем</p>
          <h2 id="about-title">Сначала ощущение. Потом масштаб.</h2>
        </div>
        <ol className="principle-list">
          <li>
            <span>01</span>
            <div>
              <h3>Руками</h3>
              <p>Каждая игра начинается с одной понятной механики.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Честно</h3>
              <p>Если ломать не весело — никакой контент это не спасёт.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>По красоте</h3>
              <p>Хороший свет, узнаваемые вещи и физика с характером.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="site-footer">
        <p>Handmade Games</p>
        <p>Алматы · 2026</p>
      </footer>
    </main>
  );
}
