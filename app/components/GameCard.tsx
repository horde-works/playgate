import Link from "next/link";
import type { GameEntry } from "../../games/registry";

interface GameCardProps {
  game: GameEntry;
  featured?: boolean;
}

export function GameCard({ game, featured = false }: GameCardProps) {
  return (
    <article
      className={`game-card${featured ? " game-card-featured" : ""}`}
      data-theme={game.theme}
    >
      <div className="game-card-copy">
        <div className="game-card-meta">
          <span>{game.stageLabel}</span>
          <span>{game.genre}</span>
        </div>
        <h3>{game.title}</h3>
        <p>{game.summary}</p>
        <Link className="button button-dark" href={game.href}>
          В игровую лабораторию
          <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className="game-card-art" aria-hidden="true">
        <span className="art-word art-word-make">MAKE</span>
        <span className="art-word art-word-a">A</span>
        <span className="art-word art-word-mess">MESS</span>
        <div className="art-block art-block-1" />
        <div className="art-block art-block-2" />
        <div className="art-block art-block-3" />
        <div className="art-block art-block-4" />
        <div className="art-spark art-spark-1" />
        <div className="art-spark art-spark-2" />
      </div>
    </article>
  );
}
