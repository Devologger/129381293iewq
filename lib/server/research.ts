import { spawn } from "node:child_process";
import type { Candle, Research } from "../terminal-engine.ts";
import type { StrategyLab } from "../strategy-lab-types.ts";
let pending = 0;
let tail: Promise<unknown> = Promise.resolve();
export async function runResearch(candles: Candle[], tolerance = .08, autoApply = false): Promise<Research> {
  return runPythonResearch("research/terminal_research.py", { candles, tolerance, auto_apply: autoApply }) as Promise<Research>;
}
export async function runStrategyLab(candles: Candle[], rangeStart?: number, rangeEnd?: number): Promise<StrategyLab> {
  return runPythonResearch("research/strategy_lab.py", { candles, range_start: rangeStart, range_end: rangeEnd }) as Promise<StrategyLab>;
}
async function runPythonResearch(script: string, payload: Record<string, unknown>): Promise<Research | StrategyLab> {
  if (pending >= 8) throw new Error("Research queue is busy. Try again shortly.");
  pending++;
  const task = tail.catch(() => {}).then(() => new Promise<Research | StrategyLab>((resolve, reject) => {
    const child = spawn(process.env.TERMINAL_PYTHON || "python3", [script], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Research timed out")); }, 20000);
    child.stdout.on("data", data => { output += data; }); child.stderr.resume(); child.stdin.on("error", () => {});
    child.on("error", () => { clearTimeout(timer); reject(new Error("Python 3 research runtime is unavailable")); });
    child.on("close", code => { clearTimeout(timer); if (code !== 0) return reject(new Error("Research rejected candle data")); try { resolve(JSON.parse(output)); } catch { reject(new Error("Research output was invalid")); } });
    child.stdin.end(JSON.stringify(payload));
  }));
  tail = task;
  try { return await task; } finally { pending--; }
}
