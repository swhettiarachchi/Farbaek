/**
 * Start app and Stop app (ADR 0023): run an app's dev server in the
 * background of a sandbox session so it can be previewed, without typing
 * shell plumbing. The app gets its own process group, so stopping it stops
 * everything it started, and its output goes to a log people can read.
 * These are ordinary sandbox commands: the guard, limits and receipts apply.
 */

const DIR = "/tmp/farbaek";
export const APP_LOG = `${DIR}/app.log`;
export const APP_PID = `${DIR}/app.pid`;

/** Single-quotes text for bash. */
export function bashQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** A sensible start command for a project, from its files. */
export function suggestedStartCommand(paths: readonly string[], port = 3000): string {
  if (paths.includes("package.json")) {
    if (paths.some((p) => p.startsWith("next.config"))) return `npm run dev -- --hostname 0.0.0.0 --port ${port}`;
    if (paths.some((p) => p.startsWith("vite.config"))) return `npm run dev -- --host 0.0.0.0 --port ${port}`;
    return "npm run dev";
  }
  if (paths.includes("manage.py")) return `python manage.py runserver 0.0.0.0:${port}`;
  if (paths.includes("index.html")) return `python3 -m http.server ${port} --bind 0.0.0.0`;
  return "npm run dev";
}

export function startAppCommand(command: string): string {
  const cmd = command.trim();
  if (!cmd || cmd.length > 1_000 || cmd.includes("\u0000")) throw new Error("Enter the command that starts your app.");
  // Stop the previous app first, so only one runs; then start the new one in its own group and note its id.
  return [
    `mkdir -p ${DIR}`,
    `if [ -f ${APP_PID} ]; then kill -TERM -- -$(cat ${APP_PID}) 2>/dev/null; rm -f ${APP_PID}; fi`,
    `setsid bash -c ${bashQuote(cmd)} > ${APP_LOG} 2>&1 < /dev/null & echo $! > ${APP_PID}`,
    `sleep 2`,
    `if kill -0 $(cat ${APP_PID}) 2>/dev/null; then echo "Started. Open the preview on its port."; else echo "The app stopped right away. Its log:"; tail -n 40 ${APP_LOG}; exit 1; fi`,
  ].join("\n");
}

export const STOP_APP_COMMAND = [
  `if [ -f ${APP_PID} ]; then kill -TERM -- -$(cat ${APP_PID}) 2>/dev/null; rm -f ${APP_PID}; echo "Stopped."; else echo "No app was running."; fi`,
].join("\n");

export const APP_LOG_COMMAND = `if [ -f ${APP_LOG} ]; then tail -n 120 ${APP_LOG}; else echo "No app has run yet."; fi`;
