import type { Metadata } from "next";
import { MakeAMessGame } from "../../../games/make-a-mess/src/game/MakeAMessGame";

export const metadata: Metadata = {
  title: "Make a Mess — Open House",
  description:
    "Открытая трёхмерная сцена с полностью разрушаемым двухэтажным домом.",
};

export default function MakeAMessPage() {
  return <MakeAMessGame />;
}
