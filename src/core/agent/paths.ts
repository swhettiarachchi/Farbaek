/**
 * Lexical path rules for the agent's copy of a project, on top of the
 * workspace rules in ../workspace/files.ts. They close gaps that only matter
 * once paths reach a real disk, especially on Windows: drive letters and
 * alternate data streams (":"), device names (CON, NUL, COM1), names that
 * Windows silently trims ("a." is "a"), and 8.3 short names ("ENVLOC~1")
 * that could alias a file the screening would refuse.
 *
 * The local runtime still resolves every path with realpath; these checks
 * fail early with a clear reason.
 */
import { checkPath, type PathCheck } from "../workspace/files";

const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;

export function checkAgentPath(raw: string): PathCheck {
  const base = checkPath(raw);
  if (!base.ok) return base;
  for (const segment of base.path.split("/")) {
    if (/[:*?"<>|]/.test(segment)) return { ok: false, reason: 'The path has a character Windows doesn\'t allow in names (: * ? " < > |).' };
    if (/[. ]$/.test(segment)) return { ok: false, reason: "A name in the path ends with a dot or a space." };
    if (WINDOWS_DEVICE.test(segment)) return { ok: false, reason: `"${segment}" is a reserved device name on Windows.` };
    if (/~\d/.test(segment)) return { ok: false, reason: 'A name in the path looks like a short 8.3 name ("~1"), which can alias another file.' };
  }
  return base;
}

/** "" or a valid folder path, for list_files. */
export function checkAgentDir(raw: string): PathCheck {
  const dir = raw.replace(/^\.\/?/, "").replace(/\/+$/, "");
  return dir === "" ? { ok: true, path: "" } : checkAgentPath(dir);
}
