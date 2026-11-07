/**
 * Brings a skill in from a GitHub link (ADR 0179). The link is read by parseSkillLink, so the file only ever
 * comes from raw.githubusercontent.com, with no redirects, a time limit and a size cap. Its licence is looked for
 * beside it, then at the top of the repository, so the person can see what they may do with it.
 */
import { licenceName, parseSkillLink } from "@/core/agent/skill-library";
import { hasDeceptiveCharacters, parseSkill, type Skill } from "@/core/agent/skills";

/** A licence can be long: the GNU ones run to about 35 KB. */
export const IMPORT_LIMITS = { skillBytes: 64 * 1024, licenceBytes: 96 * 1024, timeoutMs: 10_000 };

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type Fetched = { ok: true; text: string } | { ok: false; reason: "missing" | "too_large" | "unreachable" | "moved" };

/** A text file, read up to `max` bytes; anything bigger is refused rather than cut. */
async function fetchText(fetcher: Fetcher, url: string, max: number): Promise<Fetched> {
  let res: Response;
  try {
    res = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(IMPORT_LIMITS.timeoutMs), headers: { "user-agent": "Farbaek skill import" }, cache: "no-store" });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (res.status >= 300 && res.status < 400) return { ok: false, reason: "moved" };
  if (res.status === 404) return { ok: false, reason: "missing" };
  if (!res.ok) return { ok: false, reason: "unreachable" };
  if (Number(res.headers.get("content-length") ?? 0) > max) return { ok: false, reason: "too_large" };
  if (!res.body) return { ok: false, reason: "unreachable" };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  // The time limit also ends a body that trickles in, and a connection can drop halfway: both are "no answer".
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, text: new TextDecoder("utf-8").decode(bytes) };
}

const FAILURES: Record<Exclude<Fetched, { ok: true }>["reason"], string> = {
  missing: "There's no SKILL.md at that link. Link to the skill's SKILL.md, or to the folder it's in.",
  too_large: "That file is too big for a skill. Skills are short instructions, under 64 KB.",
  unreachable: "GitHub didn't answer. Check the link and try again in a moment.",
  moved: "GitHub says that file has moved. Open the link in your browser and copy where it lands.",
};

export type ImportedSkill = {
  skill: Skill;
  /** The file exactly as it is on GitHub. */
  text: string;
  /** Where it came from, for the person. */
  label: string;
  licence: { text: string; name: string | null } | null;
};

export async function importSkillFromLink(fetcher: Fetcher, link: string): Promise<{ ok: true; value: ImportedSkill } | { ok: false; message: string }> {
  const parsed = parseSkillLink(link);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const file = await fetchText(fetcher, parsed.url, IMPORT_LIMITS.skillBytes);
  if (!file.ok) return { ok: false, message: FAILURES[file.reason] };
  if (hasDeceptiveCharacters(file.text)) {
    return { ok: false, message: "That skill has characters that don't show on screen or that reorder text, which could hide instructions from you. It wasn't brought in." };
  }
  const folderName = parsed.path.split("/").slice(-2, -1)[0] ?? parsed.repo;
  const skill = parseSkill(file.text, folderName, "project");
  if (!skill) return { ok: false, message: "That file isn't a skill: it needs a name (in a frontmatter block or the first line) and some instructions." };

  let licence: ImportedSkill["licence"] = null;
  for (const url of parsed.licenceUrls) {
    const found = await fetchText(fetcher, url, IMPORT_LIMITS.licenceBytes);
    if (found.ok && found.text.trim()) {
      licence = { text: found.text, name: licenceName(found.text) };
      break;
    }
    // Only a missing file is a reason to look further; GitHub being down isn't.
    if (!found.ok && found.reason !== "missing") break;
  }
  return { ok: true, value: { skill, text: file.text, label: parsed.label, licence } };
}
