import type { Metadata } from "next";
import { TownGame } from "../../../games/make-a-mess/src/game/TownGame";

export const metadata: Metadata = {
  title: "Make a Mess — Open House",
  description:
    "Открытая трёхмерная сцена с полностью разрушаемым городком: панельки, старый квартал, дворы и улицы.",
};

export default function MakeAMessPage() {
  return <TownGame />;
}
