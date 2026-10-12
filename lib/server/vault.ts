import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vaultReport, type Feed, type Research, type Portfolio } from "../terminal-engine.ts";
import { saveStrategyEvidence } from "./strategy-memory.ts";

export function saveVaultNote(workspaceId: string, feed: Feed, report: Research, portfolio: Portfolio) {
  if (!/^[a-f\d]{48}$/.test(workspaceId) || !/^[A-Z0-9]{2,12}$/.test(feed.symbol)) throw new Error("Invalid vault note context");
  const directory = join(process.env.TERMINAL_VAULT_DIR || "obsidian-vault", "Research", workspaceId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const name = `${feed.exchange}-${feed.market}-${feed.symbol}-${feed.timeframe}-${report.as_of}.md`;
  const file = join(directory, name); const temporary = `${file}.tmp`;
  writeFileSync(temporary, vaultReport(feed, report, portfolio), { mode: 0o600 }); renameSync(temporary, file);
  if (report.strategy_lab) saveStrategyEvidence(workspaceId, `${feed.exchange}:${feed.market}:${feed.symbol}:${feed.timeframe}:${feed.source}`, report.strategy_lab, feed.source);
  return name;
}
