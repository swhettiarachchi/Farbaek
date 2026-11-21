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
 * - opening a site the person hasn't approved in this task asks; an approved one is allowed. A site is its name and whether it
 *   is https or http. Only public addresses by name: no local or private hosts, no addresses written as numbers, no ports, no
 *   credentials;
 * - a link to another page of an approved site is allowed, until the agent has typed or pressed something there in this task;
 *   every other press asks, and so does all typing, with the exact text shown. A step that goes to an address carries that
 *   address (`navigate`): the runtime loads it itself and never presses the link, so a page's script can't send it elsewhere;
 * - password, card, security-code and identity fields are refused outright, and so are file pickers and hidden fields: the
 *   person does those themselves;
 * - files and folders only inside the folders the person chose for the task, each change asked for; only plain text files are
 *   written and only documents and pictures are opened; anything else can only be shown in its folder, which runs nothing;
 *   removing means the recycle bin; programs, scripts and shortcuts are never written, opened or made by renaming, and
 *   nothing inside a hidden folder or a program's own folder is touched.
 */
import { canonicalHash, type JsonValue } from "../../trust/canonical-json";
import { containsSecret } from "../../workspace/files";
import type { ComputerToolCall } from "./tools";

export type ComputerRisk = "navigate" | "act" | "consequential" | "files" | "open";

export const COMPUTER_RISK_LABELS: Record<ComputerRisk, string> = {
  navigate: "Opens a site not approved yet in this task",
  act: "Acts on a page",
  consequential: "Could send, buy, post, delete or sign something",
  files: "Changes files on this computer",
  open: "Opens or shows something on this computer",
};

/**
 * `navigate`: the screened address this step goes to. The runtime loads exactly that address itself; it never presses the
 * link. A step with no `navigate` is a real press or keystrokes.
 */
export type ComputerDecision = { kind: "allow"; navigate?: string } | { kind: "ask"; risk: ComputerRisk; reason: string; navigate?: string } | { kind: "refuse"; reason: string };

/** One link, button or field of the page, as the runtime read it from the agent's own window. Its words are the page's: untrusted. */
export interface PageElement {
  n: number;
  kind: "link" | "button" | "field" | "other";
  label: string;
  /** A link's target, as the browser resolved it. */
  href?: string | null;
  /** A field's type, autocomplete hint and name, as the page declares them. */
  fieldType?: string | null;
  autocomplete?: string | null;
  name?: string | null;
}

export interface ComputerState {
  /** Sites the person approved in this task (see siteKey). */
  approvedSites: ReadonlySet<string>;
  /**
   * Sites where, in this task, the agent typed or pressed a control, or the person typed in the window. From then on the window
   * may be signed in there, and a plain link can change something, so every link on that site waits for the person.
   */
  actedOn: ReadonlySet<string>;
  /** The page the agent's window shows now, as the runtime reports it. Null before anything is open. */
  page: { url: string; elements: readonly PageElement[] } | null;
  /** The folders the person chose for this task: absolute, as the runtime resolved them. */
  roots: readonly string[];
  platform: "win32" | "darwin" | "linux";
}

/** The rules as data; their canonical hash is the policy version recorded with each approval. */
export const COMPUTER_POLICY_RULES = {
  schema: "farbaek.computer-policy/v2",
  browser: {
    window: "the agent's own, with none of the person's logins",
    read: "allow",
    site: "its name and whether it is https or http",
    open: { approved_site: "allow", other_public_site: "approval", local_private_numeric_or_credentialed: "refuse" },
    click: {
      link_to_another_page_of_an_approved_site: "allow, by loading the screened address",
      link_on_a_site_acted_on_in_this_task: "approval",
      link_elsewhere: "approval",
      link_to_the_page_it_is_on: "approval, as a button",
      anything_else: "approval",
      consequential_or_overlong_label: "approval, marked consequential",
      page_on_an_unapproved_site: "refuse",
    },
    type: { secret_fields: "refuse", file_and_hidden_fields: "refuse", secret_text: "refuse", anything_else: "approval with the exact text" },
    downloads: "none",
  },
  files: {
    where: "inside the folders the person chose, never a hidden folder or a program's own folder",
    write: "plain text files only, approval",
    open: "documents and pictures only, approval",
    show: "selects it in the file manager without opening it, approval",
    move: "approval, never changing a file's ending",
    remove: "recycle bin, approval",
    programs_scripts_shortcuts: "refuse",
  },
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

export type ScreenedUrl = { ok: true; url: string; site: string; host: string } | { ok: false; reason: string };

/**
 * The site an address belongs to, for "approved in this task": https or http, and its host in lower case without a leading
 * "www.". Approving a site over https never approves it over http, where anyone on the network can answer for it.
 */
export function siteKey(protocol: string, host: string): string {
  const name = host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return `${protocol === "http:" ? "http" : "https"}://${name}`;
}

/**
 * Whether an address may be opened in the agent's window at all. Names only: an address written as a number (in any of the
 * ways browsers accept) is refused, since nobody asks for a site that way and it is how local machines are reached. The
 * runtime checks again where the name really resolves to before it connects.
 */
export function screenUrl(raw: string): ScreenedUrl {
  if (raw.length > 2_000) return { ok: false, reason: "the address is too long" };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "that isn't a web address" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "only web addresses that start with https:// or http:// can be opened" };
  if (url.username || url.password) return { ok: false, reason: "the address carries a user name or password" };
  if (url.port) return { ok: false, reason: "the address names a port, which public sites don't need" };
  // One dot at the end is the name written in full. More than one, or an empty part anywhere, isn't a site's name.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "the address has no site in it" };
  if (host.split(".").some((part) => part === "")) return { ok: false, reason: "the address isn't a site's name" };
  // After the browser's own parsing, a numeric host is four numbers or a bracketed IPv6 address.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || /^[\d.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "the address is a number, not a site's name" };
  if (LOCAL_NAMES.test(host) || LOCAL_ENDINGS.test(host) || !host.includes(".")) return { ok: false, reason: "the address is on this computer or a private network" };
  url.hostname = host;
  url.hash = "";
  return { ok: true, url: url.toString(), site: siteKey(url.protocol, host), host };
}

/** A site as a person reads it: its name, and a word when the connection isn't encrypted. */
const siteName = (screened: { site: string; host: string }) => (screened.site.startsWith("http://") ? `${screened.host} (http, not encrypted)` : screened.host.replace(/^www\./, ""));

// ---------------------------------------------------------------------------------------------------------------------------
// Pages

/** The longest label an approval can show whole. A longer one is treated as the most careful kind, unread. */
export const LABEL_SHOWN = 300;

/**
 * Words on a control that mean pressing it could send, buy, post, remove, sign out or agree to something. They only ever add
 * caution: a control with none of them still waits for the person. English only, which is why it can't be what keeps a press safe.
 */
const CONSEQUENTIAL =
  /\b(?:pay|buy|purchase|order|checkout|check out|place order|add to (?:cart|basket|bag)|subscribe|unsubscribe|renew|upgrade|downgrade|donate|transfer|withdraw|refund|redeem|claim|bid|send|submit|post|publish|share|reply|tweet|comment|message|email|invite|vote|delete|remove|erase|empty|clear|reset|revoke|disconnect|unlink|deactivate|disable|terminate|cancel|close account|confirm|accept|agree|allow|approve|reject|decline|authori[sz]e|grant|sign up|sign in|sign out|signout|log in|login|log out|logout|register|create account|join|enrol|enroll|apply|book|reserve|install|download|upload|import|export|merge|deploy|save|proceed|complete|finish)\b/i;

const consequentialLabel = (label: string) => label.length > LABEL_SHOWN || CONSEQUENTIAL.test(label);

/** Words in a field's label or name that mean what goes there is a secret or an identity. */
const SECRET_WORDS =
  /\b(?:pass ?word|passwd|pwd|pass ?code|pass ?phrase|pin(?: ?code| number)?|secret|security (?:code|answer|question)|verification code|auth(?:entication|ori[sz]ation)? code|one ?time|otp|totp|2fa|mfa|two ?factor|recovery (?:code|key|phrase)|seed phrase|private key|api ?key|access ?token|cvv2?|cvc2?|csc|card ?(?:number|num|no|holder)|name on card|credit ?card|debit ?card|cc ?(?:number|num|no|exp|csc|cvv|cvc)|expiry|expiration|iban|account ?(?:number|no)|routing ?(?:number|no)|sort ?code|swift|bic|ssn|social security|passport|national id|nic(?: number| no)?|tax ?id|tin|driving licen[cs]e|drivers? licen[cs]e|licen[cs]e (?:number|no))\b/;
/** The same in Sinhala, where a word boundary doesn't apply. */
const SECRET_WORDS_SI = /මුරපදය|මුර පදය|රහස් පදය|රහස් අංකය/;
const SECRET_AUTOCOMPLETE = new Set(["current-password", "new-password", "one-time-code"]);

/** Why the agent never types into a field, or null when it may ask to. What goes into these is the person's to enter. */
function fieldRefusal(element: PageElement): string | null {
  const type = (element.fieldType ?? "").trim().toLowerCase();
  if (type === "file") return "That field picks a file to upload. The person chooses files themselves in the window.";
  if (type === "hidden") return "That field isn't shown on the page, so the person couldn't see what goes into it.";
  const secret = "That field takes a password, a card, a code or an identity number. The person types those themselves in the window.";
  if (type === "password") return secret;
  // The hint is a list of words: "section-pay billing cc-number", "username current-password".
  const hints = (element.autocomplete ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (hints.some((hint) => SECRET_AUTOCOMPLETE.has(hint) || hint.startsWith("cc-"))) return secret;
  if (element.label.length > LABEL_SHOWN || (element.name ?? "").length > LABEL_SHOWN) return "That field's label is too long to show in full, so it can't be approved.";
  const words = `${element.label} ${element.name ?? ""}`.toLowerCase().replace(/[_.\-[\]]+/g, " ");
  if (SECRET_WORDS.test(words) || SECRET_WORDS_SI.test(words)) return secret;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Files

/** Programs, scripts, installers, shortcuts and the folders that are programs: never written, opened or made by the agent. */
const RUNS_CODE =
  /\.(?:exe|msi|msix|appx|appxbundle|bat|cmd|com|scr|pif|cpl|ps1|psm1|psd1|vbs|vbe|js|jse|mjs|cjs|wsf|wsh|hta|reg|lnk|url|jar|dll|sys|ocx|sh|bash|zsh|fish|command|tool|app|bundle|framework|plugin|kext|pkg|mpkg|dmg|scpt|scptd|applescript|workflow|action|desktop|appimage|deb|rpm|py|pyw|rb|pl|php|chm|msc|gadget|inf|scf|library-ms|search-ms|website|iso|img|vhd|vhdx)$/i;
/** What write_text_file may write: plain text a person reads. Nothing a browser, a shell or a build tool would run. */
export const TEXT_FILE_TYPES: ReadonlySet<string> = new Set(["txt", "text", "md", "markdown", "csv", "tsv", "log"]);
/** What open_file may open with its usual app: documents and pictures. No pages, no macro documents, nothing else. */
export const OPENABLE_FILE_TYPES: ReadonlySet<string> = new Set([...TEXT_FILE_TYPES, "json", "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "docx", "xlsx", "pptx", "odt", "ods", "odp"]);
/** Names Windows gives to devices, with any ending. */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/;

/** Only A to Z are folded: Windows compares names its own way, and folding anything else could make two folders look like one. */
const foldAscii = (text: string) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

const segments = (path: string, windows: boolean) =>
  (windows ? path.replace(/\\/g, "/") : path)
    .split("/")
    .filter(Boolean)
    .map((part) => (windows ? foldAscii(part) : part));

/** Control characters, and the marks that make text read backwards (which can make "exe.txt" look like a text file). */
function unreadable(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c < 32 || c === 127 || c === 0x061c || c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
  }
  return false;
}

/** The ending of a file name, lower case, without its dot; empty when it has none. */
function ending(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** `name`: the last part of the path, which is what the kind-of-file rules read (never the text after a trailing separator). */
export type ScreenedPath = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Whether a path is inside one of the folders the person chose, by its words alone: absolute, no "..", no part that is only
 * dots or ends in a space or a dot (Windows drops those), no hidden part and no part that is a program's own folder below
 * the chosen folder, and a chosen folder as its beginning. `inside` also refuses a chosen folder itself and anything that
 * holds one (they can't be moved or removed). The runtime checks again what the path really is on disk.
 */
export function screenPath(path: string, state: Pick<ComputerState, "roots" | "platform">, inside = false): ScreenedPath {
  const windows = state.platform === "win32";
  if (path.length > 1_000) return { ok: false, reason: "the path is too long" };
  // Off Windows a backslash is an ordinary character in a name, so "chosen\x" is a file beside the chosen folder, not in it.
  if (!windows && path.includes("\\")) return { ok: false, reason: "the path has a backslash in it" };
  const absolute = windows ? /^[a-zA-Z]:[\\/]/.test(path) : path.startsWith("/");
  if (!absolute) return { ok: false, reason: "the path isn't a full path" };
  if (unreadable(path) || (windows && /[<>"|?*]/.test(path.slice(2))) || (windows && path.slice(2).includes(":"))) return { ok: false, reason: "the path has characters a file name can't have" };
  const parts = segments(path, windows);
  if (parts.some((p) => /^\.+$/.test(p) || /[ .]$/.test(p))) return { ok: false, reason: "the path steps outside its folder or has a part ending in a dot or a space" };
  if (windows && parts.slice(1).some((p) => WINDOWS_DEVICE.test(p))) return { ok: false, reason: "the path names a device, not a file" };
  // A whole drive, or a folder at the very top of the disk, is never a chosen folder.
  const bases = state.roots.map((root) => segments(root, windows)).filter((base) => base.length >= 2);
  const begins = (long: readonly string[], short: readonly string[]) => short.length <= long.length && short.every((part, i) => long[i] === part);
  if (inside) {
    if (bases.some((base) => base.length === parts.length && begins(parts, base))) return { ok: false, reason: "that is one of the chosen folders itself, which stays where it is" };
    if (bases.some((base) => base.length > parts.length && begins(base, parts))) return { ok: false, reason: "that holds one of the chosen folders, which stays where it is" };
  }
  let reason = "the path is outside the folders chosen for this task";
  for (const base of bases) {
    if (!begins(parts, base)) continue;
    const below = parts.slice(base.length);
    if (below.some((p) => p.startsWith("."))) {
      reason = "the path is in a hidden folder or is a hidden file";
      continue;
    }
    if (below.slice(0, -1).some((p) => RUNS_CODE.test(p))) {
      reason = "the path is inside a program's own folder";
      continue;
    }
    return { ok: true, name: parts[parts.length - 1]! };
  }
  return { ok: false, reason };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The decision

const refuse = (reason: string): ComputerDecision => ({ kind: "refuse", reason });
const ask = (risk: ComputerRisk, reason: string, navigate?: string): ComputerDecision => ({ kind: "ask", risk, reason, ...(navigate ? { navigate } : {}) });

function element(state: ComputerState, n: number): PageElement | null {
  return state.page?.elements.find((e) => e.n === n) ?? null;
}

/**
 * The page the agent is about to act on, when it may: open, and on a site the person approved. A window that was taken to
 * another site (a redirect, a script) is acted on only after that site is opened by name, which asks the person.
 */
function currentPage(state: ComputerState): { ok: true; url: string; site: string } | { ok: false; refusal: ComputerDecision } {
  if (!state.page) return { ok: false, refusal: refuse("No page is open. Open one, then read it.") };
  const here = screenUrl(state.page.url);
  if (!here.ok || !state.approvedSites.has(here.site)) return { ok: false, refusal: refuse("The window is showing a site that hasn't been approved in this task. Open it with browser_open first, which asks the person.") };
  return { ok: true, url: here.url, site: here.site };
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
      if (state.approvedSites.has(screened.site)) return { kind: "allow", navigate: screened.url };
      return ask("navigate", `${siteName(screened)} hasn't been opened in this task yet.`, screened.url);
    }

    case "browser_click": {
      const here = currentPage(state);
      if (!here.ok) return here.refusal;
      const target = element(state, call.input.element);
      if (!target) return refuse("That number isn't on the page as last read. Read the page again.");
      if (target.kind === "field") return refuse("That is a field. Use browser_type to fill it.");
      const consequential = consequentialLabel(target.label);
      const careful = target.label.length > LABEL_SHOWN ? "Its words are too long to show in full, so it is treated as something that could send, buy, post, delete or sign." : "Its words say it could send, buy, post, delete or sign something.";
      if (target.kind === "link" && target.href) {
        const screened = screenUrl(target.href);
        if (!screened.ok) return refuse(`That link can't be followed: ${screened.reason}.`);
        // A link to the page it is on (often "#") does whatever the page's script does when pressed: it is a button.
        if (screened.url !== here.url) {
          if (consequential) return ask("consequential", careful, screened.url);
          if (!state.approvedSites.has(screened.site)) return ask("navigate", `The link leaves for ${siteName(screened)}, which hasn't been opened in this task yet.`, screened.url);
          if (state.actedOn.has(screened.site)) return ask("act", "Something was typed or pressed on this site in this task, so it may be signed in, and a link there can change something.", screened.url);
          return { kind: "allow", navigate: screened.url };
        }
      }
      // A button, or a link with no address of its own: what it does can't be known from here, whatever it is labelled.
      return consequential ? ask("consequential", careful) : ask("act", "Pressing a control can change something on the site.");
    }

    case "browser_type": {
      const here = currentPage(state);
      if (!here.ok) return here.refusal;
      const target = element(state, call.input.element);
      if (!target) return refuse("That number isn't on the page as last read. Read the page again.");
      if (target.kind !== "field") return refuse("That isn't a field.");
      const refusal = fieldRefusal(target);
      if (refusal) return refuse(refusal);
      if (containsSecret(call.input.text)) return refuse("The text looks like a password or a key. The agent doesn't type secrets.");
      // Typing is sending: a page can pass on each letter as it is typed, before anything is pressed.
      return call.input.submit
        ? ask("consequential", "Typing and pressing Enter sends the form. The site gets this text.")
        : ask("act", "A page can send what is typed as it is typed, so treat this text as given to the site.");
    }

    case "make_folder": {
      const screened = screenPath(call.input.path, state, true);
      if (!screened.ok) return refuse(`That folder can't be made: ${screened.reason}.`);
      if (RUNS_CODE.test(screened.name)) return refuse("A folder with that ending would be a program or part of one.");
      return ask("files", "Creates a folder.");
    }

    case "write_text_file": {
      const screened = screenPath(call.input.path, state, true);
      if (!screened.ok) return refuse(`That file can't be written: ${screened.reason}.`);
      if (!TEXT_FILE_TYPES.has(ending(screened.name))) return refuse(`Only plain text files can be written here: ${[...TEXT_FILE_TYPES].map((t) => `.${t}`).join(", ")}. Programs, scripts, pages and settings files are never written outside a project.`);
      if (containsSecret(call.input.content)) return refuse("The content looks like it holds a password or a key.");
      return ask("files", "Creates or replaces a file.");
    }

    case "move_path": {
      const from = screenPath(call.input.from, state, true);
      if (!from.ok) return refuse(`That can't be moved: ${from.reason}.`);
      const to = screenPath(call.input.to, state, true);
      if (!to.ok) return refuse(`It can't be moved there: ${to.reason}.`);
      // A new ending is a new kind of file: notes.txt must never become notes.bat, or lose its ending inside a tool's folder.
      if (ending(from.name) !== ending(to.name)) return refuse("Moving or renaming can't change a file's ending, which is what says what kind of file it is.");
      return ask("files", "Moves or renames a file or folder.");
    }

    case "trash_path": {
      const screened = screenPath(call.input.path, state, true);
      return screened.ok ? ask("files", "Moves it to the recycle bin, where it can be restored.") : refuse(`That can't be removed: ${screened.reason}.`);
    }

    case "open_file": {
      const screened = screenPath(call.input.path, state, true);
      if (!screened.ok) return refuse(`That can't be opened: ${screened.reason}.`);
      if (!OPENABLE_FILE_TYPES.has(ending(screened.name))) return refuse("Only documents and pictures can be opened: text, PDF, images and office documents without macros. Programs, scripts, shortcuts and web pages are never opened.");
      return ask("open", "Opens it with its usual app.");
    }

    case "show_in_folder": {
      // Selecting something in the file manager opens and runs nothing, whatever it is, so no kind of file is special here.
      const screened = screenPath(call.input.path, state);
      return screened.ok ? ask("open", "Shows it in the file manager, selected. It isn't opened.") : refuse(`That can't be shown: ${screened.reason}.`);
    }
  }
}

/** A lone half of a character pair can't be hashed or shown. A page controls its labels, so they are mended, never trusted. */
function wellFormed(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const next = text.charCodeAt(i + 1);
    if (c >= 0xd800 && c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      out += text.slice(i, i + 2);
      i++;
    } else out += c >= 0xd800 && c <= 0xdfff ? "?" : text[i]!;
  }
  return out;
}

const mended = (text: string | null | undefined) => (text === null || text === undefined ? null : wellFormed(text));

/**
 * What an approval of a computer action is bound to: the exact call, the decision the person was asked about (its risk, and
 * the address it goes to), and everything they were shown about its target, whole. A page that changes after the person
 * looked gives a different hash, and the approval no longer fits. Null when the action isn't one that asks.
 */
export function computerApprovalAction(call: ComputerToolCall, state: ComputerState): JsonValue | null {
  const decision = decideComputer(call, state);
  if (decision.kind !== "ask") return null;
  const target = call.name === "browser_click" || call.name === "browser_type" ? element(state, call.input.element) : null;
  return {
    tool: call.name,
    input: JSON.parse(JSON.stringify(call.input)) as JsonValue,
    page: mended(state.page?.url),
    risk: decision.risk,
    navigate: decision.navigate ?? null,
    target: target
      ? { kind: target.kind, label: wellFormed(target.label), href: mended(target.href), fieldType: mended(target.fieldType), autocomplete: mended(target.autocomplete), name: mended(target.name) }
      : null,
  };
}
