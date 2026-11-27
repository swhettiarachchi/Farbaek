/**
 * Runs once when the server starts (Next.js instrumentation).
 *
 * In production it lets live agent builds keep their work when the server is told to stop (stage 291, ADR 0299): the
 * server is restarted on every deploy, and a build's work so far used to be thrown away with it. Only the Node.js
 * server has builds to drain; development is left alone, so Ctrl+C stops it at once.
 *
 * Nothing here may stop the server from starting. If it can't be set up, the server runs as it did before this
 * existed, and says so in its log.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    try {
      const [{ installDrain }, { drainCloudRuns, runsToDrainHere }] = await Promise.all([import("@/server/lifecycle/shutdown"), import("@/server/cloud-agent/executor")]);
      installDrain({ drain: drainCloudRuns, hasWork: () => runsToDrainHere() > 0 });
    } catch (error) {
      // Its name only: an error's message can carry anything.
      console.error(JSON.stringify({ level: "error", event: "shutdown.drain_not_installed", error: error instanceof Error ? error.name : "unknown" }));
    }
  }
}
