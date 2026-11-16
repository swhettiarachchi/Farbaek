import { PROMPT_STORAGE_KEY } from "@/core/agent/prompt-start";
import { STUDIO_PROMPT_KEY, type HandOff } from "./protocol";

/** The most a hand-off carries: what the shortest of the three boxes takes. */
export const HANDOFF_MAX = 2_000;

/**
 * Where an answer's chip goes and what it carries (stage 202): the last thing the person asked in this conversation, cut to
 * what the box there takes. The text waits in this browser's storage under `key`, never in the address, and the space puts it
 * in its box for the person to edit. Nothing is made or charged until they press that space's own button.
 */
export function handOffPlan(to: HandOff, messages: readonly { role: string; content: string }[]): { href: string; key: string; text: string } {
  const asked = [...messages].reverse().find((m) => m.role === "user" && m.content.trim())?.content.trim().slice(0, HANDOFF_MAX) ?? "";
  return {
    href: to === "images" ? "/app/images" : to === "video" ? "/app/video" : "/app/new",
    key: to === "build" ? PROMPT_STORAGE_KEY : STUDIO_PROMPT_KEY,
    text: asked,
  };
}
