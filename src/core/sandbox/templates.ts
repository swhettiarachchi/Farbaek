/**
 * The environments people can start, and the sizes they come in. On E2B,
 * each (template, size) pair maps to one prebuilt image whose CPU and memory
 * are fixed when the image is built (scripts/sandbox-templates.mjs). On
 * Vercel Sandbox, every pair starts from Vercel's managed universal image
 * and the size picks the vCPUs (2 GB of memory each, set by Vercel).
 * Disk is a requested minimum of free space, which E2B grows on a
 * best-effort basis; the real total shows up in the runtime's metrics.
 * After a sandbox starts, Farbaek records what the runtime actually reports,
 * so metering never relies on what was requested.
 */

export const TEMPLATE_IDS = ["node-ts", "python"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const SIZE_IDS = ["small", "standard"] as const;
export type SizeId = (typeof SIZE_IDS)[number];

export interface SandboxTemplate {
  id: TemplateId;
  label: string;
  runtime: string;
  description: string;
  /** Suggested first command once project files are in place. */
  setupCommand: string;
  /** A harmless command that proves the environment runs. */
  smokeCommand: string;
  /** File names that suggest this template fits a project. */
  signals: string[];
}

export const SANDBOX_TEMPLATES: Record<TemplateId, SandboxTemplate> = {
  "node-ts": {
    id: "node-ts",
    label: "Node.js and TypeScript",
    runtime: "Node.js LTS and npm",
    description: "For web apps, APIs and TypeScript projects. Runs builds, tests and dev servers.",
    setupCommand: "npm install",
    smokeCommand: "node --version && npm --version",
    signals: ["package.json", "tsconfig.json", "pnpm-lock.yaml"],
  },
  python: {
    id: "python",
    label: "Python",
    runtime: "Python 3 and pip",
    description: "For scripts, services and data work. Runs tests with pytest once installed.",
    setupCommand: "python3 -m pip install -r requirements.txt",
    smokeCommand: "python3 --version && python3 -m pip --version",
    signals: ["requirements.txt", "pyproject.toml", "setup.py"],
  },
};

export interface SandboxSize {
  id: SizeId;
  label: string;
  vcpu: number;
  memoryMiB: number;
  /** Requested minimum free disk (best effort on E2B). */
  diskMiB: number;
}

export const SANDBOX_SIZES: Record<SizeId, SandboxSize> = {
  small: { id: "small", label: "Small", vcpu: 1, memoryMiB: 1024, diskMiB: 4096 },
  standard: { id: "standard", label: "Standard", vcpu: 2, memoryMiB: 2048, diskMiB: 8192 },
};

/**
 * What a size actually gets on a runtime. E2B fixes CPU and memory in the
 * image and grows disk on a best-effort basis; Vercel Sandbox gives each
 * vCPU 2 GiB of memory and every sandbox a 64 GiB disk.
 */
export function sizeOnRuntime(size: SandboxSize, runtime: "e2b" | "vercel"): { vcpu: number; memoryGiB: number; disk: string; note: string } {
  if (runtime === "vercel") {
    const vcpu = size.vcpu === 1 ? 1 : Math.max(2, Math.round(size.vcpu / 2) * 2);
    return { vcpu, memoryGiB: vcpu * 2, disk: "64 GiB disk", note: "Vercel gives each vCPU 2 GiB of memory." };
  }
  return { vcpu: size.vcpu, memoryGiB: size.memoryMiB / 1024, disk: `about ${size.diskMiB / 1024} GiB free disk`, note: "CPU and memory are fixed by the runtime image; disk is best effort." };
}

/** Vercel's managed image with Node.js LTS and Python 3, used for every template on Vercel Sandbox. */
export const VERCEL_DEFAULT_IMAGE = "vercel/sandbox/universal";

/** The runtime image name for a template and size, unless the deployment overrides it. */
export function defaultImageName(template: TemplateId, size: SizeId, provider: "e2b" | "vercel" = "e2b"): string {
  if (provider === "vercel") return VERCEL_DEFAULT_IMAGE;
  return `farbaek-${template === "node-ts" ? "node" : "python"}-${size}`;
}

/** Suggests a template from a project's file paths, or null when nothing points either way. */
export function suggestTemplate(paths: readonly string[]): TemplateId | null {
  const names = new Set(paths.map((p) => p.split("/").at(-1) ?? p));
  for (const id of TEMPLATE_IDS) {
    if (SANDBOX_TEMPLATES[id].signals.some((s) => names.has(s))) return id;
  }
  return null;
}
