/**
 * The key Studio's editors are mounted under (ADR 0160, stage 156). They start over from the server's
 * files when a file they edit changes, which is what a save does. A photo uploaded while editing adds an
 * image file, and that must not throw the draft away, or the photo never reaches the picture it was
 * uploaded for.
 */
export function studioEditorKey(files: readonly { path: string; revision: number; encoding?: string }[]): string {
  return files
    .filter((f) => f.encoding !== "base64")
    .map((f) => `${f.path}@${f.revision}`)
    .join("|");
}
