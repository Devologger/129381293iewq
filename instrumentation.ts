export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") { const { startPaperWorker } = await import("./lib/server/worker"); startPaperWorker(); }
}
