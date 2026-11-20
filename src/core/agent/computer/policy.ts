/**
 * The policy of a computer task (stage 208, ADR 0225): for each validated tool call, allow it, ask the person first, or refuse
 * it, with a reason in plain words. Framework-free; the desktop runtime calls it before anything runs and enforces the real
 * boundaries itself (where a name resolves to, what a path really is on disk, which element is under a number).
 *
 * What it reads: the call, and facts the runtime reports about the world (the page the agent's own window shows, the folders
 * the person chose). What it never reads: what a page, a file or the model says should be allowed. A page's words can make a
 * decision stricter (a button labelled "Pay" is a consequential press) and never looser: a button with any other label still
 * waits for the person.
 *
 * The rules, in short:
 * - reading the agent's own browser window, going back and finishing are allowed;
 * - opening a site the person hasn't approved in this task asks; an approved one is allowed. Only public https and http
 *   addresses by name: no local or private hosts, no addresses written as numbers, no ports, no credentials;
 * - a link inside an approved site is allowed; every other press asks, and so does all typing, with the exact text shown;
 * - password, card, security-code and identity fields are refused outright: the person types those themselves;
 * - files and folders only inside the folders the person chose for the task, each change asked for; removing means the
 *   recycle bin; programs, scripts and shortcuts are never written or opened.
 */
import { canonicalHash, type JsonValue } from "../../trust/canonical-json";
import { containsSecret } from "../../workspace/files";
import type { ComputerToolCall } from "./tools";

export type ComputerRisk = "navigate" | "act" | "consequential" | "files";

export const COMPUTER_RISK_LABELS: Record<ComputerRisk, string> = {
  navigate: "Opens a site not approved yet in this task",
  act: "Acts on a page",
  consequential: "Could send, buy, post, delete or sign something",
  files: "Changes files on this computer",
};

export type ComputerDecision = { kind: "allow" } | { kind: "ask"; risk: ComputerRisk; reason: string } | { kind: "refuse"; reason: string };

/** One link, button or field of the page, as the runtime read it from the agent's own window. Its words are the page's: untrusted. */
export interface PageElement {
  n: number;
  kind: "link" | "button" | "field" | "other";
  label: string;
  /** A link's target, as the browser resolved it. */
  href?: string | null;
  /** A field's type and autocomplete hint, as the page declares them. */
  fieldType?: string | null;
  autocomplete?: string | null;
}

export interface ComputerState {
  /** Sites the person approved in this task (see siteKey). */
  approvedSites: ReadonlySet<string>;
  /** The page the agent's window shows now, as the runtime reports it. Null before anything is open. */
  page: { url: string; elements: readonly PageElement[] } | null;
  /** The folders the person chose for this task: absolute, as the runtime resolved them. */
  roots: readonly string[];
  platform: "win32" | "darwin" | "linux";
}

/** The rules as data; their canonical hash is the policy version recorded with each approval. */
export const COMPUTER_POLICY_RULES = {
  schema: "farbaek.computer-policy/v1",
  browser: {
    window: "the agent's own, with none of the person's logins",
    read: "allow",
    open: { approved_site: "allow", other_public_site: "approval", local_private_numeric_or_credentialed: "refuse" },
    click: { link_within_approved_site: "allow", link_elsewhere: "approval", anything_else: "approval", consequential_label: "approval, marked consequential" },
    type: { secret_fields: "refuse", secret_text: "refuse", anything_else: "approval with the exact text" },
    downloads: "none",
  },
  files: { where: "inside the folders the person chose", change: "approval", remove: "recycle bin, approval", programs_scripts_shortcuts: "refuse" },
  never_reads: "what a page, a file or the model says should be allowed",
} as const;

let version: Promise<string> | null = null;
export function computerPolicyVersion(): Promise<string> {
  version ??= canonicalHash(COMPUTER_POLICY_RULES);
  return version;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Addresses

const LOCAL_NAMES = /^(?:localhost|localhost\.localdomain|ip6-localhost|ip6-loopback|broadcasthost)$/i;
/** Endings that never name a public site: local networks, internal names, and the reserved test names. */
const LOCAL_ENDINGS = /\.(?:local|localhost|internal|intranet|lan|home|corp|private|test|invalid|example|home\.arpa|onion)$/i;

export type ScreenedUrl = { ok: true; url: string; site: string } | { ok: false; reason: string };

/** The site an address belongs to, for "approved in this task": its host in lower case, without a leading "www.". */
export function siteKey(host: string): string {
  return host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/**
 * Whether an address may be opened in the agent's window at all. Names only: an address written as a number (in any of the
 * ways browsers accept) is refused, since nobody asks for a site that way and it is how local machines are reached. The
 * runtime checks again where the name really resolves to before it connects.
 */
export function screenUrl(raw: string): ScreenedUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "that isn't a web address" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "only web addresses that start with https:// or http:// can be opened" };
  if (url.username || url.password) return { ok: false, reason: "the address carries a user name or password" };
  if (url.port) return { ok: false, reason: "the address names a port, which public sites don't need" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "the address has no site in it" };
  // After the browser's own parsing, a numeric host is four numbers or a bracketed IPv6 address.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || /^[\d.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "the address is a number, not a site's name" };
  if (LOCAL_NAMES.test(host) || LOCAL_ENDINGS.test(host) || !host.includes(".")) return { ok: false, reason: "the address is on this computer or a private network" };
  url.hash = "";
  return { ok: true, url: url.toString(), site: siteKey(host) };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Pages

/** Words on a control that mean pressing it could send, buy, post, remove or agree to something. They only ever add caution. */
const CONSEQUENTIAL =
  /\b(?:pay|buy|purchase|order|checkout|check out|place order|subscribe|donate|transfer|send|submit|post|publish|share|reply|tweet|comment|delete|remove|erase|cancel (?:order|subscription|account)|close account|confirm|accept|agree|allow|authori[sz]e|grant|sign up|sign in|log in|login|register|create account|apply|book|reserve|install|download|upload|save changes|unsubscribe)\b/i;

/** A field the agent never types into: what goes there is the person's to enter. */
function secretField(element: PageElement): boolean {
  const type = (element.fieldType ?? "").toLowerCase();
  const auto = (element.autocomplete ?? "").toLowerCase();
  if (type === "password") return true;
  if (/^(?:current-password|new-password|one-time-code)$/.test(auto) || auto.startsWith("cc-")) return true;
  return /\b(?:password|passcode|passphrase|pin|cvv|cvc|card number|card no|security code|verification code|one[- ]time|otp|2fa|ssn|social security|passport|national id|nic)\b/i.test(element.label.slice(0, 200));
}

// ---------------------------------------------------------------------------------------------------------------------------
// Files

/** Programs, scripts, installers and shortcuts: never written and never opened by the agent. */
const RUNS_CODE = /\.(?:exe|msi|msix|appx|bat|cmd|com|scr|pif|cpl|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|reg|lnk|url|jar|dll|sys|sh|bash|zsh|command|tool|app|pkg|dmg|scpt|applescript|workflow|action|desktop|py|rb|pl|php)$/i;

const segments = (path: string, windows: boolean) =>
  path
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((s) => (windows ? s.toLowerCase() : s));

export type ScreenedPath = { ok: true } | { ok: false; reason: string };

/**
 * Whether a path is inside one of the folders the person chose, by its words alone: absolute, no "..", no part that is only
 * dots or ends in a space or a dot (Windows drops those), and a chosen folder as its beginning. `inside` also refuses the
 * chosen folder itself (it can't be moved or removed). The runtime checks again what the path really is on disk.
 */
export function screenPath(path: string, state: Pick<ComputerState, "roots" | "platform">, inside = false): ScreenedPath {
  const windows = state.platform === "win32";
  const absolute = windows ? /^[a-zA-Z]:[\\/]/.test(path) : path.startsWith("/");
  if (!absolute) return { ok: false, reason: "the path isn't a full path" };
  if (/[\0\r\n]/.test(path) || (windows && /[<>"|?*]/.test(path.slice(2))) || (windows && path.slice(2).includes(":"))) return { ok: false, reason: "the path has characters a file name can't have" };
  const parts = segments(path, windows);
  if (parts.some((p) => /^\.+$/.test(p) || /[ .]$/.test(p))) return { ok: false, reason: "the path steps outside its folder or has a part ending in a dot or a space" };
  for (const root of state.roots) {
    const base = segments(root, windows);
    if (base.length === 0 || parts.length < base.length) continue;
    if (!base.every((b, i) => parts[i] === b)) continue;
    if (inside && parts.length === base.length) return { ok: false, reason: "that is one of the chosen folders itself, which stays where it is" };
    return { ok: true };
  }
  return { ok: false, reason: "the path is outside the folders chosen for this task" };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The decision

const refuse = (reason: string): ComputerDecision => ({ kind: "refuse", reason });
const ask = (risk: ComputerRisk, reason: string): ComputerDecision => ({ kind: "ask", risk, reason });

function element(state: ComputerState, n: number): PageElement | null {
  return state.page?.elements.find((e) => e.n === n) ?? null;
}

export function decideComputer(call: ComputerToolCall, state: ComputerState): ComputerDecision {
  switch (call.name) {
    case "browser_read":
    case "browser_back":
    case "finish":
      return { kind: "allow" };

    case "browser_open": {
      const screened = screenUrl(call.input.url);
      if (!screened.ok) return refuse(`That address can't be opened: ${screened.reason}.`);
      if (state.approvedSites.has(screened.site)) return { kind: "allow" };
      return ask("navigate", `${screened.site} hasn't been opened in this task yet.`);
    }

    case "browser_click": {
      if (!state.page) return refuse("No page is open. Open one, then read it.");
      const target = element(state, call.input.element);
      if (!target) return refuse("That number isn't on the page as last read. Read the page again.");
      if (target.kind === "field") return refuse("That is a field. Use browser_type to fill it.");
      const consequential = CONSEQUENTIAL.test(target.label.slice(0, 200));
      if (target.kind === "link" && target.href) {
        const screened = screenUrl(target.href);
        if (!screened.ok) return refuse(`That link can't be followed: ${screened.reason}.`);
        if (consequential) return ask("consequential", "The link's words say it could send, buy, post, delete or sign something.");
        if (state.approvedSites.has(screened.site)) return { kind: "allow" };
        return ask("navigate", `The link leaves for ${screened.site}, which hasn't been opened in this task yet.`);
      }
      // A button, or a link with no address of its own: what it does can't be known from here, whatever it is labelled.
      return consequential ? ask("consequential", "The control's words say it could send, buy, post, delete or sign something.") : ask("act", "Pressing a control can change something on the site.");
    }

    case "browser_type": {
      if (!state.page) return refuse("No page is open. Open one, then read it.");
      const target = element(state, call.input.element);
      if (!target) return refuse("That number isn't on the page as last read. Read the page again.");
      if (target.kind !== "field") return refuse("That isn't a field.");
      if (secretField(target)) return refuse("That field takes a password, a card, a code or an identity number. The person types those themselves in the window.");
      if (containsSecret(call.input.text)) return refuse("The text looks like a password or a key. The agent doesn't type secrets.");
      return call.input.submit ? ask("consequential", "Typing and pressing Enter usually sends a form.") : ask("act", "Typing into a page.");
    }

    case "make_folder": {
      const screened = screenPath(call.input.path, state, true);
      return screened.ok ? ask("files", "Creates a folder.") : refuse(`That folder can't be made: ${screened.reason}.`);
    }

    case "write_text_file": {
      const screened = screenPath(call.input.path, state, true);
      if (!screened.ok) return refuse(`That file can't be written: ${screened.reason}.`);
      if (RUNS_CODE.test(call.input.path)) return refuse("That would be a program, a script or a shortcut. The agent doesn't write those outside a project.");
      if (containsSecret(call.input.content)) return refuse("The content looks like it holds a password or a key.");
      return ask("files", "Creates or replaces a file.");
    }

    case "move_path": {
      const from = screenPath(call.input.from, state, true);
      if (!from.ok) return refuse(`That can't be moved: ${from.reason}.`);
      const to = screenPath(call.input.to, state, true);
      if (!to.ok) return refuse(`It can't be moved there: ${to.reason}.`);
      if (RUNS_CODE.test(call.input.to) && !RUNS_CODE.test(call.input.from)) return refuse("Renaming it that way would make it a program, a script or a shortcut.");
      return ask("files", "Moves or renames a file or folder.");
    }

    case "trash_path": {
      const screened = screenPath(call.input.path, state, true);
      return screened.ok ? ask("files", "Moves it to the recycle bin, where it can be restored.") : refuse(`That can't be removed: ${screened.reason}.`);
    }

    case "open_path": {
      const screened = screenPath(call.input.path, state);
      if (!screened.ok) return refuse(`That can't be opened: ${screened.reason}.`);
      if (RUNS_CODE.test(call.input.path)) return refuse("That is a program, a script or a shortcut. The agent doesn't run those.");
      return ask("files", "Opens it with its usual app.");
    }
  }
}

/**
 * What an approval of a computer action is bound to: the exact call and what the person was shown about its target. A page
 * that changes after the person looked gives a different hash, and the approval no longer fits.
 */
export function computerApprovalAction(call: ComputerToolCall, state: ComputerState): JsonValue {
  const target = call.name === "browser_click" || call.name === "browser_type" ? element(state, call.input.element) : null;
  return {
    tool: call.name,
    input: JSON.parse(JSON.stringify(call.input)) as JsonValue,
    page: state.page?.url ?? null,
    target: target ? { kind: target.kind, label: target.label.slice(0, 200), href: target.href ?? null, fieldType: target.fieldType ?? null } : null,
  };
}
