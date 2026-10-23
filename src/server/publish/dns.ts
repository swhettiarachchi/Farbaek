import { Resolver } from "node:dns/promises";
import type { DnsLookup } from "./domains";

/** "No such name" and "no records of this type" mean an empty answer, not a failure. */
const EMPTY = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ENONAME"]);

/**
 * DNS answers for checking a custom domain (ADR 0045), with a short timeout
 * so a slow provider can't hold a request. Other failures throw, and the
 * check says DNS didn't answer.
 */
export function createDnsLookup(): DnsLookup {
  const resolver = new Resolver({ timeout: 4_000, tries: 2 });
  const quiet = async <T>(query: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await query();
    } catch (error) {
      if (EMPTY.has((error as { code?: string }).code ?? "")) return [];
      throw error;
    }
  };
  return {
    txt: async (name) => (await quiet(() => resolver.resolveTxt(name))).map((chunks) => chunks.join("")),
    cname: (name) => quiet(() => resolver.resolveCname(name)),
    a: (name) => quiet(() => resolver.resolve4(name)),
  };
}
