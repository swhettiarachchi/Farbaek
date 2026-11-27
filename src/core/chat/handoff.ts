import { PROMPT_STORAGE_KEY } from "@/core/agent/prompt-start";
import { readAction } from "./intent";
import { STUDIO_PROMPT_KEY, type HandOff } from "./protocol";

/** The most a hand-off carries: what the shortest of the three boxes takes. */
export const HANDOFF_MAX = 2_000;

/**
 * Where an answer's chip goes and what it carries (stage 202): the last thing the person asked in this conversation, cut to
 * what the box there takes. The text waits in this browser's storage under `key`, never in the address, and the space puts it
 * in its box for the person to edit. Nothing is made or charged until they press that space's own button. The desktop entry
 * (stage 206) only opens the page for the desktop app: nothing is carried, because nothing in Farbaek sends a request to it.
 */
export function handOffPlan(to: HandOff, messages: readonly { role: string; content: string }[]): { href: string; key: string; text: string } {
  if (to === "desktop") return { href: "/app/agents", key: STUDIO_PROMPT_KEY, text: "" };
  const asked = [...messages].reverse().find((m) => m.role === "user" && m.content.trim())?.content.trim().slice(0, HANDOFF_MAX) ?? "";
  return {
    href: to === "images" ? "/app/images" : to === "video" ? "/app/video" : "/app/build",
    key: to === "build" ? PROMPT_STORAGE_KEY : STUDIO_PROMPT_KEY,
    text: asked,
  };
}

const edge = (list: string) => new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${list})(?![\\p{L}\\p{M}\\p{N}])`, "iu");

const WANTS: { to: Exclude<HandOff, "desktop">; re: RegExp }[] = [
  {
    to: "images",
    re: edge("image|images|picture|pictures|photo|logo|poster|illustration|drawing|icon|wallpaper|banner|thumbnail|avatar|sticker|artwork|flyer|pinthurayak|pinthura|pinthure|photo ekak|logo ekak|poster ekak|image ekak|පින්තූරයක්|පින්තූර|ඡායාරූපයක්|ලෝගෝ එකක්|පෝස්ටරයක්"),
  },
  { to: "video", re: edge("video|videos|clip|animation|reel|trailer|short film|intro video|video ekak|clip ekak|වීඩියෝ|වීඩියෝවක්") },
  {
    to: "build",
    re: edge("website|web site|landing page|web app|webapp|web page|webpage|portfolio site|online store|online shop|blog site|dashboard|website ekak|web site ekak|site ekak|web app ekak|වෙබ් අඩවියක්|වෙබ් අඩවි|වෙබ්සයිට්|වෙබ්සයිට් එකක්"),
  },
];

/**
 * The places worth offering under an answer (stage 206, ADR 0223), read from what the person asked: a request about a picture
 * offers Images, one about a site offers Build, a request to act on the computer offers the desktop app's page. A question
 * about anything else offers none, so an answer about the news isn't followed by "Build a website".
 */
export function suggestHandOffs(question: string): HandOff[] {
  const text = question.normalize("NFC").slice(0, 600);
  const out: HandOff[] = WANTS.filter((w) => w.re.test(text)).map((w) => w.to);
  if (readAction(question)) out.push("desktop");
  return out;
}
