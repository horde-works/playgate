import type { Metadata } from "next";
import { RainSeamGame } from "../../../../games/make-a-mess/src/game/RainSeamGame";

export const metadata: Metadata = {
  title: "Make a Mess: Дождевой двор",
  description:
    "Полностью разрушаемый старый двор после дождя: три тесно стоящих дома, мокрая земля, красная ограда с фонарями, голубые ворота, черепица, газовые трубы, цветы и велосипеды.",
};

export default function RainSeamPage() {
  return <RainSeamGame />;
}
