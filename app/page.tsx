import type { Metadata } from "next";
import { HomeView } from "./components/HomeView";

export const metadata: Metadata = {
  title: "Games we make ourselves",
  description:
    "A small home-made collection of hand-built games. Starting with Make a Mess.",
};

export default function Home() {
  return <HomeView />;
}
