/** Types for manifest.mjs, which the film tests import. */
export function filmHash(name: string, bytes: Buffer): string;
export function filmManifest(dir?: string): Record<string, string>;
export function writeFilmManifest(): Record<string, string>;
