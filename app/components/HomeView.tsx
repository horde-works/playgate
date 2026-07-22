"use client";

import Link from "next/link";
import { GameCard } from "./GameCard";
import { SiteHeader } from "./SiteHeader";
import { featuredGame } from "../../games/registry";
import { useLanguage } from "../i18n/LanguageProvider";

export function HomeView() {
  const { t } = useLanguage();
  return (
    <main className="site-shell">
      <SiteHeader />

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            {t("home.eyebrow")}
          </p>
          <h1 id="hero-title">
            {t("home.title1")}
            <span>{t("home.title2")}</span>
          </h1>
          <p className="hero-lede">{t("home.lede")}</p>
          <div className="hero-actions">
            <Link className="button button-primary" href={featuredGame.href}>
              {t("home.openCta")}
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" href="/games">
              {t("home.catalogLink")}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="hero-art" aria-label={t("home.heroArtAria")}>
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
            <p className="section-index">{t("home.featuredIndex")}</p>
            <h2 id="featured-title">{t("home.featuredTitle")}</h2>
          </div>
          <p>{t("home.featuredLede")}</p>
        </div>
        <GameCard game={featuredGame} featured />
      </section>

      <section className="principles" id="about" aria-labelledby="about-title">
        <div className="principles-intro">
          <p className="section-index">{t("home.principlesIndex")}</p>
          <h2 id="about-title">{t("home.principlesTitle")}</h2>
        </div>
        <ol className="principle-list">
          <li>
            <span>01</span>
            <div>
              <h3>{t("home.p1.title")}</h3>
              <p>{t("home.p1.body")}</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>{t("home.p2.title")}</h3>
              <p>{t("home.p2.body")}</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>{t("home.p3.title")}</h3>
              <p>{t("home.p3.body")}</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="site-footer">
        <p>Handmade Games</p>
        <p>{t("footer.place")}</p>
      </footer>
    </main>
  );
}
