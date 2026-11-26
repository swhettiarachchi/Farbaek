import "server-only";
import { cookies } from "next/headers";
import { LEVEL_COOKIE, readLevel, type Level } from "@/core/experience/level";

/**
 * How much of Farbaek this person chose to see (stage 285, ADR 0293), from their cookie. Standard when they never chose.
 * It only picks what the menus list: what a person may do is checked by their role and plan, never by this.
 */
export async function savedLevel(): Promise<Level> {
  const jar = await cookies();
  return readLevel(jar.get(LEVEL_COOKIE)?.value);
}
