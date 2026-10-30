/**
 * Reversibility Radar (ADR 0122, spec §10): how far each file in a change can
 * be undone, with the basis and the limits. Deterministic rules from the
 * file's path and the lines the change adds; nothing is run and nothing is
 * guessed past what those show. Farbaek's own Undo covers project files
 * only: what already ran from a file (a migration, a deploy, a payment) is
 * outside it, and the radar says so.
 */
import type { ProposedChange } from "@/core/realityloop/change-proposal";
import { diffLines } from "@/core/realityloop/line-diff";

export const REVERSIBILITY = ["rollback_supported", "compensating_action", "unknown", "forward_fix", "requires_backup"] as const;
export type Reversibility = (typeof REVERSIBILITY)[number];

/** The spec's five classes, in order from easiest to hardest to undo. */
export const REVERSIBILITY_LABELS: Record<Reversibility, string> = {
  rollback_supported: "Rollback supported",
  compensating_action: "Compensating action available",
  unknown: "Reversibility unknown",
  forward_fix: "Forward fix required",
  requires_backup: "Requires a backup",
};

export type ChangeArea = "migration" | "dependencies" | "ci_infra" | "public_api" | "integration" | "files";

export const AREA_LABELS: Record<ChangeArea, string> = {
  migration: "Database migration",
  dependencies: "Dependencies",
  ci_infra: "CI, build or deploy settings",
  public_api: "Public API",
  integration: "Talks to another service",
  files: "Project file",
};

export interface FileReversibility {
  path: string;
  area: ChangeArea;
  reversibility: Reversibility;
  /** Why it's in this class. */
  basis: string;
  /** What Undo can't do here. */
  limits: string;
}

const MIGRATION = /(^|\/)(migrations?|migrate|db\/schema)\/|\.sql$/i;
const DESTRUCTIVE = /\b(drop\s+(table|column|schema|index|view|function|type|database)|truncate\b|delete\s+from|alter\s+table\s+\S+\s+(drop|rename)|update\s+\S+\s+set)\b/i;
const DEPENDENCIES = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[\w.-]*\.txt|pyproject\.toml|poetry\.lock|pipfile(\.lock)?|gemfile(\.lock)?|go\.(mod|sum)|cargo\.(toml|lock)|composer\.(json|lock))$/i;
const CI_INFRA = /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.yml$|dockerfile$|docker-compose[\w.-]*\.ya?ml$|compose\.ya?ml$|vercel\.json$|netlify\.toml$|fly\.toml$|render\.yaml$|procfile$|wrangler\.(toml|jsonc?)$|k8s\/|helm\/|terraform\/)|\.tf$/i;
const PUBLIC_API = /(^|\/)(app|pages|src\/app|src\/pages)\/api\/|(^|\/)openapi\.(ya?ml|json)$|(^|\/)swagger\.(ya?ml|json)$|\.graphql$/i;
const INTEGRATION = /\b(webhooks?|stripe|paypal|dodo|checkout|sendgrid|twilio|mailgun|resend|nodemailer|smtp)\b|fetch\(\s*["'`]https?:\/\//i;

const UNDO = "Farbaek keeps every revision: Undo writes the earlier content back, or removes a file this change created.";
const ONLY_WHILE = "Only while the file still holds what was applied; newer edits are never overwritten.";

/** The lines a change adds, which are what can carry new effects. */
function addedLines(change: ProposedChange, base: string): string {
  if (change.kind === "create") return change.content;
  return diffLines(base, change.content)
    .flatMap((h) => h.added)
    .join("\n");
}

export function classifyChange(change: ProposedChange, base: string): FileReversibility {
  const path = change.path;
  const added = addedLines(change, base);
  if (MIGRATION.test(path)) {
    return DESTRUCTIVE.test(added)
      ? {
          path,
          area: "migration",
          reversibility: "requires_backup",
          basis: "The migration removes or rewrites data (a drop, delete, truncate, rename or update).",
          limits: "Undo restores the file, not the data it already changed. Take a backup before it runs; restoring that backup is the only way back.",
        }
      : {
          path,
          area: "migration",
          reversibility: "forward_fix",
          basis: "A database migration adds or changes structure.",
          limits: "Undo restores the file, not the database it already ran on. Once applied, undoing it takes a new migration.",
        };
  }
  if (DEPENDENCIES.test(path)) {
    return {
      path,
      area: "dependencies",
      reversibility: "compensating_action",
      basis: "It changes which packages the project uses.",
      limits: "Undo restores the manifest; reinstall the packages to go back to the old versions.",
    };
  }
  if (CI_INFRA.test(path)) {
    return {
      path,
      area: "ci_infra",
      reversibility: "compensating_action",
      basis: "It changes how the project is built, tested or deployed.",
      limits: "Undo restores the file; anything already run or deployed from it isn't undone. Run or deploy again after undoing.",
    };
  }
  if (PUBLIC_API.test(path)) {
    return {
      path,
      area: "public_api",
      reversibility: "unknown",
      basis: "It changes an API other programs can call.",
      limits: "Undo restores the file, but callers outside this project may already depend on the change, and Farbaek can't see them.",
    };
  }
  if (INTEGRATION.test(added)) {
    return {
      path,
      area: "integration",
      reversibility: "unknown",
      basis: "The new code talks to another service (a payment, an email, a webhook or an outside address).",
      limits: "Undo restores the file; what it already sent to that service can't be called back from Farbaek.",
    };
  }
  return { path, area: "files", reversibility: "rollback_supported", basis: UNDO, limits: ONLY_WHILE };
}

const rank = (r: Reversibility) => REVERSIBILITY.indexOf(r);

/** Every file's class, hardest to undo first, and the change's overall class: its hardest file. */
export function reversibilityRadar(changes: readonly ProposedChange[], bases: Readonly<Record<string, string>>): { overall: Reversibility; files: FileReversibility[] } {
  const files = changes.map((c) => classifyChange(c, bases[c.path] ?? "")).sort((a, b) => rank(b.reversibility) - rank(a.reversibility) || a.path.localeCompare(b.path));
  const overall = files.reduce<Reversibility>((worst, f) => (rank(f.reversibility) > rank(worst) ? f.reversibility : worst), "rollback_supported");
  return { overall, files };
}
