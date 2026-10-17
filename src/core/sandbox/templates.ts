/**
 * The environments people can start, and the sizes they come in. Each
 * (template, size) pair maps to one prebuilt runtime image whose CPU, memory
 * and disk are fixed when the image is built (scripts/sandbox-templates.mjs).
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
    runtime: "Node.js 22 LTS, npm, pnpm, TypeScript",
    description: "For web apps, APIs and TypeScript projects. Runs builds, tests and dev servers.",
    setupCommand: "npm install",
    smokeCommand: "node --version && npm --version",
    signals: ["package.json", "tsconfig.json", "pnpm-lock.yaml"],
  },
  python: {
    id: "python",
    label: "Python",
    runtime: "Python 3.12, pip, venv",
    description: "For scripts, services and data work. Runs tests with pytest once installed.",
    setupCommand: "python -m pip install -r requirements.txt",
    smokeCommand: "python --version && pip --version",
    signals: ["requirements.txt", "pyproject.toml", "setup.py"],
  },
};

export interface SandboxSize {
  id: SizeId;
  label: string;
  vcpu: number;
  memoryMiB: number;
  diskMiB: number;
}

export const SANDBOX_SIZES: Record<SizeId, SandboxSize> = {
  small: { id: "small", label: "Small", vcpu: 1, memoryMiB: 1024, diskMiB: 4096 },
  standard: { id: "standard", label: "Standard", vcpu: 2, memoryMiB: 2048, diskMiB: 8192 },
};

/** The runtime image name for a template and size, unless the deployment overrides it. */
export function defaultImageName(template: TemplateId, size: SizeId): string {
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
