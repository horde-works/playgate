import type { Metadata } from "next";
import { AstanaGame } from "../../../../games/make-a-mess/src/game/AstanaGame";

export const metadata: Metadata = {
  title: "Make a Mess: Astana",
  description:
    "Остров-заповедник по мотивам Астаны: степь, река Есиль, лесозащитный пояс. Здесь ничего нельзя сломать — это дом, а не полигон.",
};

export default function AstanaPage() {
  return <AstanaGame />;
}
