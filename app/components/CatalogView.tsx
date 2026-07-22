"use client";

import Link from "next/link";
import { GameCard } from "./GameCard";
import { SiteHeader } from "./SiteHeader";
import { games } from "../../games/registry";
import { useLanguage } from "../i18n/LanguageProvider";

export function CatalogView() {
  const { t } = useLanguage();
  return (
    <main className="site-shell catalog-page">
      <SiteHeader />

      <section className="catalog-hero">
        <p className="eyebrow">
          <span className="eyebrow-dot" />
          {t("catalog.eyebrow")}
        </p>
        <h1>
          {t("catalog.title1")}
          <span>{t("catalog.title2")}</span>
        </h1>
        <p>{t("catalog.lede")}</p>
      </section>

      <section className="catalog-grid" aria-label={t("catalog.gridAria")}>
        {games.map((game) => (
          <GameCard game={game} key={game.slug} />
        ))}

        <article className="future-card">
          <span className="future-plus" aria-hidden="true">
            +
          </span>
          <div>
            <p className="section-index">{t("catalog.nextIndex")}</p>
            <h2>{t("catalog.nextTitle")}</h2>
            <p>{t("catalog.nextBody")}</p>
          </div>
        </article>
      </section>

      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span>
        {t("catalog.back")}
      </Link>
    </main>
  );
}
