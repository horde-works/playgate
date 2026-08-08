import type { Metadata } from "next";
import { IslandAirportGame } from "../../../../games/make-a-mess/src/game/IslandAirportGame";

export const metadata: Metadata = {
  title: "Make a Mess: Island Airport",
  description:
    "Детальный аэропорт небольшого города на вытянутом острове: ВПП, терминал, перрон, башня, ангар и служебная инфраструктура.",
};

export default function IslandAirportPage() {
  return <IslandAirportGame />;
}
