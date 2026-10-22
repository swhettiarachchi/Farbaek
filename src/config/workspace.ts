/**
 * Platform limits for project files. These protect the database and the
 * server, they are not plan limits, and the database re-checks each one.
 * The server action body limit in next.config.ts sits just above
 * MAX_IMPORT_BYTES.
 */
export const WORKSPACE_LIMITS = {
  /** Largest single text file. */
  maxFileBytes: 512 * 1024,
  /** Most text sent in one import. */
  maxImportBytes: 4 * 1024 * 1024,
  /** Total size of a project's current files. */
  maxProjectBytes: 25 * 1024 * 1024,
  /** Most files in one project. */
  maxProjectFiles: 3_000,
} as const;

/**
 * What a Workspace Capsule may hold when it's opened (ADR 0037). The browser
 * preview and the server use the same numbers; the server action body limit
 * in next.config.ts sits just above maxTotalBytes.
 */
export const CAPSULE_LIMITS = {
  maxFileBytes: WORKSPACE_LIMITS.maxFileBytes,
  maxFiles: WORKSPACE_LIMITS.maxProjectFiles,
  maxTotalBytes: 5 * 1024 * 1024,
} as const;
