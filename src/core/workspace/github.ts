/**
 * Importing a public GitHub repository (ADR 0074): reading what a person
 * pasted, and the only addresses the server may fetch for it. GitHub answers
 * an archive request with a redirect to codeload.github.com, and writes the
 * commit's hash into the archive's comment, so the import knows exactly
 * which commit it holds.
 */

export interface GitHubSource {
  owner: string;
  repo: string;
  /** A branch, tag or commit; null for the repository's default branch. */
  ref: string | null;
}

export const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;

function validRef(ref: string): boolean {
  return REF.test(ref) && !ref.includes("..") && !ref.startsWith("/") && !ref.startsWith("-") && !ref.endsWith("/") && !ref.includes("//");
}

/**
 * Reads "owner/repo", a github.com address (with /tree/<ref> for a branch or
 * tag), or a git remote, into a source. Null for anything else.
 */
export function parseGitHubSource(input: string): GitHubSource | null {
  let text = input.trim();
  if (!text || text.length > 400) return null;
  text = text.replace(/^git@github\.com:/i, "github.com/");
  text = text.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "");
  if (/^[a-z]+:\/\//i.test(text) || text.includes("@") || text.includes("?") || text.includes("#")) return null;
  const parts = text.replace(/\/+$/, "").split("/");
  const owner = parts[0] ?? "";
  const repo = (parts[1] ?? "").replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  if (parts.length === 2) return { owner, repo, ref: null };
  if (parts[2] !== "tree" || parts.length < 4) return null;
  const ref = parts.slice(3).join("/");
  return validRef(ref) ? { owner, repo, ref } : null;
}

export function sourceLabel(source: GitHubSource): string {
  return `github.com/${source.owner}/${source.repo}${source.ref ? `/tree/${source.ref}` : ""}`;
}

/** The archive request; GitHub redirects it to the commit it resolves to. */
export function archiveUrl(source: GitHubSource): string {
  const ref = source.ref ? source.ref.split("/").map(encodeURIComponent).join("/") : "HEAD";
  return `https://github.com/${source.owner}/${source.repo}/archive/${ref}.zip`;
}

/**
 * Where GitHub's redirect sends the download, rebuilt from checked parts:
 * only codeload.github.com, only this repository, and only the commit or the
 * same branch or tag that was asked for. Null for anything else, so a
 * redirect can never steer the server to another host or repository.
 */
export function archiveFromRedirect(location: string | null, source: GitHubSource): { url: string; commit: string | null } | null {
  if (!location) return null;
  let url: URL;
  try {
    url = new URL(location);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "codeload.github.com" || url.port !== "" || url.search || url.hash || url.username || url.password) return null;
  const m = /^\/([^/]+)\/([^/]+)\/zip\/(.+)$/.exec(url.pathname);
  if (!m) return null;
  // GitHub keeps names case-insensitive and redirects to their real spelling.
  if (m[1]!.toLowerCase() !== source.owner.toLowerCase() || m[2]!.toLowerCase() !== source.repo.toLowerCase()) return null;
  let rest: string;
  try {
    rest = decodeURIComponent(m[3]!);
  } catch {
    return null;
  }
  const base = `https://codeload.github.com/${source.owner}/${source.repo}/zip/`;
  if (/^[0-9a-f]{40}$/.test(rest)) return { url: base + rest, commit: rest };
  if (!source.ref) return null;
  const named = rest.replace(/^refs\/(?:heads|tags)\//, "");
  if (named !== source.ref) return null;
  const kind = rest.slice(0, rest.length - named.length);
  return { url: base + kind + source.ref.split("/").map(encodeURIComponent).join("/"), commit: null };
}

/** The commit hash GitHub writes as a zip archive's comment, or null. */
export function commitFromArchive(data: Uint8Array): string | null {
  // The end record is 22 bytes plus a comment of at most 65,535, at the very end.
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const stop = Math.max(0, data.length - 22 - 0xffff);
  for (let i = data.length - 22; i >= stop; i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const length = view.getUint16(i + 20, true);
    if (i + 22 + length !== data.length) continue;
    const comment = new TextDecoder().decode(data.subarray(i + 22, i + 22 + length));
    return /^[0-9a-f]{40}$/.test(comment) ? comment : null;
  }
  return null;
}
