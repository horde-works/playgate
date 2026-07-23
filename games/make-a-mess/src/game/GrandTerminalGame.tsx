"use client";

import { MakeAMessGame } from "./MakeAMessGame";
import { grandTerminalFlyover } from "./grandTerminalFlyover";
import { grandTerminalScene } from "./grandTerminalScene";

export function GrandTerminalGame() {
  return <MakeAMessGame scene={grandTerminalScene} flyover={grandTerminalFlyover} />;
}
