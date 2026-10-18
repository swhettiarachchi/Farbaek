import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { STOP_APP_COMMAND, bashQuote, startAppCommand, suggestedStartCommand } from "./app-process";

const bashAvailable = (() => {
  try {
    execFileSync("bash", ["-c", "true"]);
    return true;
  } catch {
    return false;
  }
})();

describe("app process commands", () => {
  it("suggests a start command that listens beyond localhost", () => {
    expect(suggestedStartCommand(["package.json", "next.config.ts"])).toBe("npm run dev -- --hostname 0.0.0.0 --port 3000");
    expect(suggestedStartCommand(["package.json", "vite.config.js"], 5173)).toBe("npm run dev -- --host 0.0.0.0 --port 5173");
    expect(suggestedStartCommand(["index.html", "styles.css"])).toBe("python3 -m http.server 3000 --bind 0.0.0.0");
  });

  it("quotes the person's command as one argument, whatever it contains", () => {
    expect(bashQuote("echo 'hi' && ls")).toBe(`'echo '\\''hi'\\'' && ls'`);
    expect(startAppCommand("npm run dev")).toContain(`setsid bash -c 'npm run dev' > /tmp/farbaek/app.log`);
    expect(() => startAppCommand("  ")).toThrow(/Enter the command/);
  });

  it.skipIf(!bashAvailable)("survives being parsed by bash", () => {
    // bash -n only parses; nothing runs.
    for (const cmd of [startAppCommand(`node -e "console.log('it\\'s up')"`), STOP_APP_COMMAND]) {
      expect(() => execFileSync("bash", ["-n", "-c", cmd])).not.toThrow();
    }
  });
});
