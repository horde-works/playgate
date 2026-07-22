"use client";

import Link from "next/link";
import type { GameEntry } from "../../games/registry";
import { useLanguage } from "../i18n/LanguageProvider";
import { gameCardCopy } from "../i18n/dictionary";

interface GameCardProps {
  game: GameEntry;
  featured?: boolean;
}

export function GameCard({ game, featured = false }: GameCardProps) {
  const { language, t } = useLanguage();
  const copy = gameCardCopy[game.slug]?.[language] ?? {
    stageLabel: game.stageLabel,
    genre: game.genre,
    summary: game.summary,
  };
  return (
    <article
      className={`game-card${featured ? " game-card-featured" : ""}`}
      data-theme={game.theme}
    >
      <div className="game-card-copy">
        <div className="game-card-meta">
          <span>{copy.stageLabel}</span>
          <span>{copy.genre}</span>
        </div>
        <h3>{game.title}</h3>
        <p>{copy.summary}</p>
        <Link className="button button-dark" href={game.href}>
          {t("card.cta")}
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
      ) : game.art === "grand-terminal" ? (
        <div className="game-card-art game-card-art-terminal" aria-hidden="true">
          <span className="art-word art-word-grand">GRAND</span>
          <span className="art-word art-word-terminal">TERMINAL</span>
          <div className="art-terminal-clock" />
          <div className="art-terminal-roof">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="art-terminal-platform" />
          <div className="art-terminal-engine">
            <div className="art-terminal-chimney" />
            <div className="art-terminal-boiler" />
            <div className="art-terminal-cab" />
            <div className="art-terminal-wheel art-terminal-wheel-1" />
            <div className="art-terminal-wheel art-terminal-wheel-2" />
            <div className="art-terminal-wheel art-terminal-wheel-3" />
          </div>
          <div className="art-spark art-spark-1" />
          <div className="art-spark art-spark-2" />
        </div>
      ) : game.art === "viking-village" ? (
        <div className="game-card-art game-card-art-viking" aria-hidden="true">
          <span className="art-word art-word-viking">VIKING</span>
          <span className="art-word art-word-village">VILLAGE</span>
          <div className="art-viking-hall">
            <div className="art-viking-roof art-viking-roof-left" />
            <div className="art-viking-roof art-viking-roof-right" />
            <div className="art-viking-door" />
          </div>
          <div className="art-viking-palisade">
            {Array.from({ length: 13 }, (_, index) => <i key={index} />)}
          </div>
          <div className="art-viking-shield">
            <i />
          </div>
          <div className="art-viking-torch art-viking-torch-left" />
          <div className="art-viking-torch art-viking-torch-right" />
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
