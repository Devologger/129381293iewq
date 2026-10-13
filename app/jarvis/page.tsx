import type { Metadata } from "next";
import { TradingTerminal } from "@/components/terminal/trading-terminal";
export const metadata: Metadata = { title: "Cinematic JARVIS", description: "Penguin's immersive voice and research command interface." };
export default function JarvisPage() { return <TradingTerminal initialView="jarvis" />; }
