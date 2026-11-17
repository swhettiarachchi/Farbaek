import type { LookupAddress, LookupOptions } from "node:dns";

export interface ReaderNet {
  lookup: (hostname: string, options: LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => void;
  isAllowed: (address: string) => boolean;
  ports: string[];
  allowLocalNames: boolean;
}

export type FetchResult =
  | { ok: true; url: string; status: number; contentType: string; robotsTag: string; tdm: string; text: string }
  | { ok: false; reason: string; status?: number };

export const USER_AGENT: string;
export const PUBLIC_NET: Readonly<ReaderNet>;
export function testNet(
  resolver: (hostname: string, options: LookupOptions & { all: true }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void,
  isAllowed: (address: string) => boolean,
  ports: string[],
): ReaderNet;
export function refuseUrl(raw: string, net?: ReaderNet): string | null;
export function fetchPage(
  rawUrl: string,
  options?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; types?: string[] | null; signal?: AbortSignal; net?: ReaderNet },
): Promise<FetchResult>;
