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

      {game.art === "minas-tirith" ? (
        <div className="game-card-art game-card-art-minas" aria-hidden="true">
          <span className="art-word art-word-minas">MINAS</span>
          <span className="art-word art-word-tirith">TIRITH</span>
          <div className="art-mountain art-mountain-1" />
          <div className="art-mountain art-mountain-2" />
          <div className="art-tower">
            <div className="art-tower-eye" />
            <div className="art-tower-tier art-tower-tier-1" />
            <div className="art-tower-tier art-tower-tier-2" />
            <div className="art-tower-tier art-tower-tier-3" />
          </div>
          <div className="art-wall">
            <div className="art-merlon" />
            <div className="art-merlon" />
            <div className="art-merlon" />
            <div className="art-merlon" />
            <div className="art-merlon" />
          </div>
          <div className="art-torch art-torch-1" />
          <div className="art-torch art-torch-2" />
          <div className="art-spark art-spark-1" />
          <div className="art-spark art-spark-2" />
        </div>
      ) : (
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
      )}
    </article>
  );
}
