import type { Metadata } from "next";
import { CatalogView } from "../components/CatalogView";

export const metadata: Metadata = {
  title: "Game catalogue",
  description: "Every game from our little home lab.",
};

export default function GamesPage() {
  return <CatalogView />;
}
