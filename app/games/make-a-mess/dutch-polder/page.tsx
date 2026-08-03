import type { Metadata } from "next";
import { DutchPolderGame } from "../../../../games/make-a-mess/src/game/DutchPolderGame";

export const metadata: Metadata = {
  title: "Make a Mess: Dutch Polder",
  description:
    "Неровный голландский польдер в натуральном масштабе: четыре разные мельницы, дома, каналы, мосты, цветочные грядки и дорожки.",
};

export default function DutchPolderPage() {
  return <DutchPolderGame />;
}
