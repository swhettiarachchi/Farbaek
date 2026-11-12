/**
 * "Share a copy" on the device page (ADR 0192): the project as this device
 * has it, with changes not yet sent, as one .zip. The system share sheet when
 * the browser can share files, otherwise a download.
 */
import { zipFiles } from "@/core/workspace/zip";

export function zipName(projectName: string): string {
  return `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project"}.zip`;
}

export async function shareOrDownload(name: string, files: readonly { path: string; content: string | Uint8Array }[], title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const bytes = zipFiles([...files].sort((a, b) => a.path.localeCompare(b.path)));
  const file = new File([bytes], name, { type: "application/zip" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      // Closing the share sheet isn't a failure.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return "downloaded";
}
