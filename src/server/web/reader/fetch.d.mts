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

export type PictureResult = { ok: true; contentType: string; bytes: Buffer } | { ok: false; reason: string };

export const USER_AGENT: string;
export const PICTURE_TYPES: string[];
export function fetchPicture(rawUrl: string, options?: { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal; net?: ReaderNet }): Promise<PictureResult>;
export function pictureKind(bytes: Uint8Array | null | undefined): string | null;
export const PUBLIC_NET: Readonly<ReaderNet>;
export function testNet(
  resolver: (hostname: string, options: LookupOptions & { all: true }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void,
  isAllowed: (address: string) => boolean,
  ports: string[],
): ReaderNet;
export function refuseUrl(raw: string, net?: ReaderNet): string | null;
export function fetchPage(
  rawUrl: string,
  options?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; types?: string[] | null; signal?: AbortSignal; net?: ReaderNet; bytes?: boolean; httpsOnly?: boolean },
): Promise<FetchResult>;
