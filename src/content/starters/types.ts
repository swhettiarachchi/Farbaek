export interface StarterFile {
  path: string;
  content: string;
}

export type StarterId = "blank" | "static-website" | "nextjs-app" | "rest-api" | "members-app" | TemplateId;

/** Templates: finished-looking sites with sample content, shown in the gallery. */
export type TemplateId = "landing-page" | "saas-site" | "portfolio" | "local-business" | "luxury" | "event-page" | "blog" | "online-store" | "booking" | "dashboard" | "crm";

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
  /** A plain starting point (the project form) or a template with sample content (the gallery). */
  kind: "starter" | "template";
  /** For templates: an example of what to ask for, prefilled in the prompt box. */
  examplePrompt?: string;
  /**
   * For a starter that runs a server but belongs in the template gallery too
   * (stage 180): static snapshots of its pages with sample content, which the
   * gallery shows instead of running it.
   */
  gallery?: { preview: StarterFile[] };
}
