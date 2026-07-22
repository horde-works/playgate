export type GameStatus = "building" | "playable" | "archived";
export type GameTheme = "safety-orange" | "electric-blue" | "acid-green";
export type GameArt = "mess" | "minas-tirith" | "grand-terminal";

export interface GameEntry {
  readonly slug: string;
  readonly title: string;
  readonly href: `/games/${string}`;
  readonly summary: string;
  readonly genre: string;
  readonly status: GameStatus;
  readonly stageLabel: string;
  readonly theme: GameTheme;
  readonly art: GameArt;
}

export const games = [
  {
    slug: "make-a-mess",
    title: "Make a Mess",
    href: "/games/make-a-mess",
    summary:
      "Разрушаемая песочница про материалы, опоры и радость хорошо устроенного беспорядка.",
    genre: "Destruction sandbox",
    status: "building",
    stageLabel: "Собираем ядро",
    theme: "safety-orange",
    art: "mess",
  },
  {
    slug: "make-a-mess-minas-tirith",
    title: "Make a Mess: Minas Tirith",
    href: "/games/make-a-mess/minas-tirith",
    summary:
      "Горная крепость с тёмной стеной, воротами и многоэтажной башней — всё на том же едином движке разрушения.",
    genre: "Siege sandbox",
    status: "playable",
    stageLabel: "Новая карта",
    theme: "electric-blue",
    art: "minas-tirith",
  },
  {
    slug: "make-a-mess-grand-terminal",
    title: "Make a Mess: Grand Terminal",
    href: "/games/make-a-mess/grand-terminal",
    summary:
      "Европейский железнодорожный музей: большой вокзал, стеклянный дебаркадер, платформы, паровозы, вагоны и кассовый зал.",
    genre: "Railway destruction sandbox",
    status: "playable",
    stageLabel: "Третья карта",
    theme: "acid-green",
    art: "grand-terminal",
  },
] as const satisfies readonly GameEntry[];

export const featuredGame = games[0];
