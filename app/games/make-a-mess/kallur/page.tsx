import type { Metadata } from "next";
import { KallurGame } from "../../../../games/make-a-mess/src/game/KallurGame";

export const metadata: Metadata = {
  title: "Make a Mess — Kallur",
  description:
    "Фарерский остров отдыха: гигантский травяной склон, отвесная слоистая стена, тропа по хребту и крошечный маяк над туманным морем.",
};

export default function KallurPage() {
  return <KallurGame />;
}
