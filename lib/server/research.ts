import { spawn } from "node:child_process";
import type { Candle, Research } from "../terminal-engine.ts";
let pending = 0;
let tail: Promise<unknown> = Promise.resolve();
export async function runResearch(candles: Candle[], tolerance = .08, autoApply = false): Promise<Research> {
  if (pending >= 8) throw new Error("Research queue is busy. Try again shortly.");
  pending++;
  const task = tail.catch(() => {}).then(() => new Promise<Research>((resolve, reject) => {
    const child = spawn(process.env.TERMINAL_PYTHON || "python3", ["research/terminal_research.py"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Research timed out")); }, 20000);
    child.stdout.on("data", data => { output += data; }); child.stderr.resume(); child.stdin.on("error", () => {});
    child.on("error", () => { clearTimeout(timer); reject(new Error("Python 3 research runtime is unavailable")); });
    child.on("close", code => { clearTimeout(timer); if (code !== 0) return reject(new Error("Research rejected candle data")); try { resolve(JSON.parse(output)); } catch { reject(new Error("Research output was invalid")); } });
    child.stdin.end(JSON.stringify({ candles, tolerance, auto_apply: autoApply }));
  }));
  tail = task;
  try { return await task; } finally { pending--; }
}
