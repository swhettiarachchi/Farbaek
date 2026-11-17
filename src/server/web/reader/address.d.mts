import type { LookupAddress, LookupOptions } from "node:dns";

export function isPublicIp(address: string): boolean;
export function isLocalName(host: string): boolean;
type Resolver = (hostname: string, options: LookupOptions & { all: true; verbatim?: boolean }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
export function guardLookup(resolver?: Resolver, isAllowed?: (address: string) => boolean, allowLocalNames?: boolean): typeof publicLookup;
export function publicLookup(
  hostname: string,
  options: LookupOptions | number | ((error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void),
  callback?: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void;
