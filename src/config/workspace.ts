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
