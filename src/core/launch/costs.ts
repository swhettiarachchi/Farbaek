/**
 * What will cost money when a project launches (ADR 0141, spec §6 and §12):
 * the things in a project's own files that hosts and services bill for, each
 * with the evidence it came from. There are no prices here, on purpose:
 * Farbaek doesn't charge for launches, and it can't see a person's plan or
 * traffic at the host or at each service, so any dollar figure would be a
 * guess. Each provider's own price list has the numbers.
 */
import type { LaunchPlan, PlannerInput, ServiceKind } from "./planner";

export interface CostDriver {
  id: string;
  title: string;
  /** What's billed and how, in a sentence or two. */
  detail: string;
  /** Where Farbaek saw it: a file, a package or a command. */
  evidence: string | null;
}

const SERVICE_COSTS: Record<ServiceKind, { title: string; detail: string }> = {
  database: { title: "A database", detail: "Billed by its own provider, usually by storage, compute and data moved, beyond a free allowance." },
  auth: { title: "Sign-in", detail: "Some sign-in providers bill per monthly active user beyond a free allowance." },
  payments: { title: "Payments", detail: "The payment provider takes a fee on each transaction." },
  storage: { title: "File storage", detail: "Billed by the data stored and downloaded." },
  email: { title: "Email", detail: "Most email providers bill per message beyond a free allowance." },
  ai: { title: "AI calls", detail: "The AI provider bills per token on the key the app uses. Farbaek's usage doesn't cover it." },
};

const FUNCTION_FILE = /^(?:src\/)?app\/(?:.+\/)?route\.[cm]?[jt]sx?$|^(?:src\/)?pages\/api\/.+\.[cm]?[jt]sx?$|^api\/.+\.[cm]?[jt]sx?$|^netlify\/functions\/.+\.[cm]?[jt]sx?$/;

/** The cost drivers in a project, most important first. */
export function costDrivers(plan: LaunchPlan, input: PlannerInput): CostDriver[] {
  const out: CostDriver[] = [];
  if (plan.hosting === "server") {
    out.push({
      id: "server",
      title: "Code runs for every visit",
      detail: "It needs a host that runs code. Hosts bill that by use beyond what a plan includes: compute time, requests, or a server that's always on.",
      evidence: plan.start?.command ?? plan.evidence[0] ?? null,
    });
  } else if (plan.hosting === "static") {
    out.push({
      id: "static",
      title: "Static files only",
      detail: "Hosts serve them from a content network. What grows a bill is bandwidth: the size of the pages times the visits.",
      evidence: `${plan.fileCount} ${plan.fileCount === 1 ? "file" : "files"}`,
    });
  }

  const functions = input.paths.filter((p) => FUNCTION_FILE.test(p));
  if (functions.length > 0) {
    out.push({
      id: "functions",
      title: `${functions.length} ${functions.length === 1 ? "function" : "functions"} that run per request`,
      detail: "Each API route runs as a function when it's called. Hosts count the calls and how long they run.",
      evidence: functions.slice(0, 3).join(", ") + (functions.length > 3 ? ` and ${functions.length - 3} more` : ""),
    });
  }

  const imageFile = Object.entries(input.texts).find(([, text]) => /from\s+["']next\/image["']/.test(text))?.[0];
  if (imageFile) {
    out.push({
      id: "images",
      title: "Optimised images",
      detail: "next/image asks the host to resize images. Most hosts count optimised images toward a limit, or bill for them; a plain <img> doesn't.",
      evidence: imageFile,
    });
  }

  const vercel = input.texts["vercel.json"] ?? "";
  const netlify = input.texts["netlify.toml"] ?? "";
  if (/"crons"\s*:/.test(vercel) || /^\s*schedule\s*=/m.test(netlify)) {
    out.push({
      id: "scheduled",
      title: "Scheduled jobs",
      detail: "They run on a timer whether anyone visits or not, and count as function runs.",
      evidence: /"crons"\s*:/.test(vercel) ? "vercel.json" : "netlify.toml",
    });
  }

  if (plan.build) {
    out.push({ id: "build", title: "A build on every launch", detail: "Hosts count build minutes. Most plans include some each month.", evidence: plan.build.command });
  }

  for (const s of plan.services) out.push({ id: `service-${s.kind}`, ...SERVICE_COSTS[s.kind], evidence: s.via });
  return out;
}

/** Where each host lists its prices, for the person to check. */
export const PRICING_PAGES: { name: string; url: string }[] = [
  { name: "Vercel", url: "https://vercel.com/pricing" },
  { name: "Netlify", url: "https://www.netlify.com/pricing/" },
];
