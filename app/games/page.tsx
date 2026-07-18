import type { Metadata } from "next";
import Link from "next/link";
import { GameCard } from "../components/GameCard";
import { SiteHeader } from "../components/SiteHeader";
import { games } from "../../games/registry";

export const metadata: Metadata = {
  title: "Каталог игр",
  description: "Все игры нашей домашней лаборатории.",
};

export default function GamesPage() {
  return (
    <main className="site-shell catalog-page">
      <SiteHeader />

      <section className="catalog-hero">
        <p className="eyebrow">
          <span className="eyebrow-dot" />
          Каталог
        </p>
        <h1>
          Маленькие игры.
          <span>Большие эксперименты.</span>
        </h1>
        <p>
          Каждая получает собственное пространство, правила и характер. Общими
          остаются только главная страница и желание сделать хорошо.
        </p>
      </section>

      <section className="catalog-grid" aria-label="Игры">
        {games.map((game) => (
          <GameCard game={game} key={game.slug} />
        ))}

        <article className="future-card">
          <span className="future-plus" aria-hidden="true">
            +
          </span>
          <div>
            <p className="section-index">Следующий слот</p>
            <h2>Пока пусто</h2>
            <p>Здесь появится следующая игра, когда у неё появится идея.</p>
          </div>
        </article>
      </section>

      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span>
        На главную
      </Link>
    </main>
  );
}
