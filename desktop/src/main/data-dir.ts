/**
 * Where Farbaek Agent keeps its data (ADR 0098). Normally Electron's own
 * folder in AppData. Installed from the Microsoft Store, the app runs as an
 * MSIX package, and Windows quietly redirects a package's writes under AppData
 * to a private copy; the git, pnpm and node a run starts in a working copy
 * there could miss it. So a Store install keeps its data in the home folder,
 * which isn't redirected.
 */
import path from "node:path";

export function storeDataDir(options: { windowsStore: boolean; home: string }): string | null {
  return options.windowsStore ? path.join(options.home, ".farbaek-agent") : null;
}
