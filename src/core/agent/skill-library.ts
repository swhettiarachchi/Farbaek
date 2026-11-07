/**
 * The skill library (ADR 0179): open-licensed skills anyone can add to a project in one step, and skills
 * brought in from a GitHub link. A library skill becomes ordinary project files, so it goes through the same
 * limits, history and approval as a skill someone writes (ADR 0030, ADR 0043). These helpers are pure: where a
 * library skill's files go, and how a GitHub link is read without letting it point anywhere else.
 */

export const SKILL_USES = ["websites", "apps", "phone-apps", "pictures"] as const;
export type SkillUse = (typeof SKILL_USES)[number];

export const SKILL_USE_LABELS: Record<SkillUse, string> = {
  websites: "Websites",
  apps: "Apps",
  "phone-apps": "Phone apps",
  pictures: "Pictures",
};

export type LibraryLicence = "MIT" | "Apache-2.0" | "Farbaek";

export const LICENCE_LABELS: Record<LibraryLicence, string> = {
  MIT: "MIT licence",
  "Apache-2.0": "Apache 2.0 licence",
  Farbaek: "Farbaek's own",
};

export interface LibrarySkillMeta {
  /** Its folder name, in the library and in a project. */
  id: string;
  /** A plain name for the card. */
  label: string;
  /** One sentence: what it makes a build do. */
  summary: string;
  uses: readonly SkillUse[];
  author: string;
  licence: LibraryLicence;
  /** Where the original lives, or null for Farbaek's own. */
  source: string | null;
}

export interface LibrarySkill extends LibrarySkillMeta {
  /** The SKILL.md a project receives. */
  markdown: string;
  /** The licence that travels with it, or null for Farbaek's own. */
  licenceText: string | null;
}

/** Where a skill lives in a project. */
export const skillFolder = (id: string) => `.farbaek/skills/${id}`;
export const skillFilePath = (id: string) => `${skillFolder(id)}/SKILL.md`;

/** The files a project receives for a library skill: its SKILL.md, and its licence beside it. */
export function libraryFiles(skill: Pick<LibrarySkill, "id" | "markdown" | "licenceText">): { path: string; content: string }[] {
  return [
    { path: skillFilePath(skill.id), content: skill.markdown },
    ...(skill.licenceText ? [{ path: `${skillFolder(skill.id)}/LICENSE.txt`, content: skill.licenceText }] : []),
  ];
}

/** A skill's instructions without its frontmatter, for reading on a card. */
export function skillText(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

export interface SkillLink {
  owner: string;
  repo: string;
  ref: string;
  /** The SKILL.md's path in the repository. */
  path: string;
  /** Where the file is read from: always raw.githubusercontent.com. */
  url: string;
  /** Where a licence may be, nearest first. */
  licenceUrls: string[];
  /** How the link is named back to the person. */
  label: string;
}

const RAW = "https://raw.githubusercontent.com";
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const SEGMENT = /^[A-Za-z0-9_.@+-]{1,200}$/;
const LINK_HELP = "Use a GitHub link to a skill: its SKILL.md, or the folder it's in.";

/**
 * Reads a GitHub link to a skill: a SKILL.md (blob or raw), the folder that holds one, or a repository whose top
 * folder does. Whatever is pasted, the file is only ever fetched from raw.githubusercontent.com, so a link can't
 * make the server reach anything else.
 */
export function parseSkillLink(input: string): SkillLink | { error: string } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { error: LINK_HELP };
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return { error: LINK_HELP };
  const parts = url.pathname.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return "\u0000";
    }
  });

  // A branch or tag can be named in full ("refs/heads/main"), as GitHub's own Raw button now links.
  const refAt = (from: string[]): [string[], string[]] => (from[0] === "refs" && (from[1] === "heads" || from[1] === "tags") ? [from.slice(0, 3), from.slice(3)] : [from.slice(0, 1), from.slice(1)]);
  let owner: string, repo: string, ref: string[], rest: string[];
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    [owner = "", repo = ""] = parts;
    if (parts.length === 2) {
      ref = ["HEAD"];
      rest = [];
    } else if (parts[2] === "blob" || parts[2] === "tree" || parts[2] === "raw") {
      [ref, rest] = refAt(parts.slice(3));
    } else return { error: LINK_HELP };
  } else if (url.hostname === "raw.githubusercontent.com") {
    [owner = "", repo = ""] = parts;
    [ref, rest] = refAt(parts.slice(2));
  } else return { error: "Only GitHub links can be used here. Paste the skill's text instead for anywhere else." };

  repo = repo.replace(/\.git$/, "");
  const segmentOk = (p: string) => SEGMENT.test(p) && p !== "." && p !== "..";
  if (!NAME.test(owner) || !NAME.test(repo) || ref.length === 0 || !ref.every(segmentOk) || !rest.every(segmentOk)) return { error: LINK_HELP };

  const folder = rest.length && /\.md$/i.test(rest[rest.length - 1]!) ? rest.slice(0, -1) : rest;
  const file = rest.length && /\.md$/i.test(rest[rest.length - 1]!) ? rest[rest.length - 1]! : "SKILL.md";
  const path = [...folder, file].join("/");
  const at = (p: string[]) => [RAW, owner, repo, ...ref, ...p].map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join("/");
  const names = ["LICENSE", "LICENSE.txt", "LICENSE.md"];
  const licenceUrls = [...(folder.length ? names.map((n) => at([...folder, n])) : []), ...names.map((n) => at([n]))];
  return { owner, repo, ref: ref.join("/"), path, url: at([...folder, file]), licenceUrls, label: `${owner}/${repo}/${path}` };
}

/** A plain name for the licence a file holds, or null when it isn't one we recognise. */
export function licenceName(text: string): string | null {
  const head = text.slice(0, 600);
  if (/\bMIT License\b|Permission is hereby granted, free of charge/i.test(head)) return "MIT";
  if (/Apache License,?\s+Version 2\.0/i.test(head)) return "Apache 2.0";
  if (/\bISC License\b/i.test(head)) return "ISC";
  if (/BSD (?:2|3)-Clause|Redistribution and use in source and binary forms/i.test(head)) return "BSD";
  if (/Mozilla Public License/i.test(head)) return "MPL 2.0";
  if (/GNU (?:AFFERO |LESSER )?GENERAL PUBLIC LICENSE/i.test(head)) return "GPL";
  if (/Creative Commons|\bCC BY\b|\bCC0\b/i.test(head)) return "Creative Commons";
  if (/This is free and unencumbered software released into the public domain/i.test(head)) return "The Unlicense";
  return null;
}
