export interface StarterFile {
  path: string;
  content: string;
}

export type StarterId = "blank" | "static-website" | "nextjs-app";

export interface Starter {
  id: StarterId;
  name: string;
  summary: string;
  files: StarterFile[];
  /**
   * How the project runs in a sandbox: the install command (null when there's
   * nothing to install), the command that serves it, and its port. Null for a
   * project that previews as plain files.
   */
  run: { install: string | null; dev: string; port: number } | null;
  /** True when the files preview as they are, with no sandbox. */
  staticPreview: boolean;
}
