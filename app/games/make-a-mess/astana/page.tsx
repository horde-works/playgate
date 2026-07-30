import type { Metadata } from "next";
import { AstanaGame } from "../../../../games/make-a-mess/src/game/AstanaGame";

export const metadata: Metadata = {
  title: "Make a Mess: The Capital",
  description:
    "The heart of the Great Steppe, where the ancient and new Silk Roads connect cultures, journeys and worlds.",
};

export default function AstanaPage() {
  return <AstanaGame />;
}
