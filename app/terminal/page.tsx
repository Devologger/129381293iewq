import type { Metadata } from "next";
import { TradingTerminal } from "@/components/terminal/trading-terminal";

export const metadata: Metadata = {
  title: "Obsidian · Trading terminal",
  description: "A multi-market paper trading and Fibonacci research workspace.",
};

export default function TerminalPage() {
  return <TradingTerminal />;
}
