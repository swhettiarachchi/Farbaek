/**
 * The model registry as a page people can read (docs/farbaek/FARBAEK_MODEL_REGISTRY.md). The page is written from the
 * registry and the rate card, and a test fails when the two drift apart, so the document can't say something the code
 * doesn't. Prices are in it, so nothing a browser loads imports this file.
 */
import { RATE_CARD } from "@/core/billing/rate-card";
import { MODEL_REGISTRY, PRICE_CHECK_DAYS, PROVIDER_NAMES, ROLE_NAMES, providersFor, type ModelEntry, type ModelProvider, type ModelRole } from "./model-registry";

const ROLES: readonly ModelRole[] = ["chat", "build", "second-check", "images", "project-images", "video"];

const usd = (n: number) => `$${n}`;

function row(m: ModelEntry): string {
  const rate = RATE_CARD[m.id];
  return `| ${m.name} | \`${m.id}\` | ${m.makes} | ${m.roles.map((r) => ROLE_NAMES[r]).join(", ")} | ${m.tiers.length ? m.tiers.join(", ") : "none"} | ${usd(rate.input)} | ${usd(rate.output)} | ${m.priceReadOn ?? "not recorded"} |`;
}

export function registryDocument(): string {
  const lines: string[] = [
    "# Farbaek model registry",
    "",
    "Every AI model Farbaek uses, written from the code by `src/core/ai/model-registry-doc.ts`. Don't edit this page by hand: change `src/core/ai/model-registry.ts` or `src/core/billing/rate-card.ts`, then run `WRITE_DOCS=1 pnpm exec vitest run src/core/ai/model-registry.test.ts`. A test fails when this page and the code disagree.",
    "",
    "**What is here:** who makes each model, what it produces, what Farbaek uses it for, the tiers it answers at, its price per million tokens, and the day that price was last read from the provider's own pricing page.",
    "",
    `**What is not here yet:** context size, release date, retirement date, speed and measured quality. Those have to be read from each provider's pages or measured, with the day they were read. A price marked "not recorded" has no date in the code; it and any price older than ${PRICE_CHECK_DAYS} days should be read again.`,
    "",
  ];
  for (const provider of Object.keys(PROVIDER_NAMES) as ModelProvider[]) {
    const models = MODEL_REGISTRY.filter((m) => m.provider === provider);
    if (models.length === 0) continue;
    lines.push(`## ${PROVIDER_NAMES[provider]}`, "", "| Model | Id | Makes | Used for | Tiers | Input | Output | Price read on |", "| --- | --- | --- | --- | --- | --- | --- | --- |", ...models.map(row), "");
  }
  lines.push("## Who can stand in for whom", "", "A use with one provider has no stand-in when that provider is down.", "", "| Use | Providers |", "| --- | --- |");
  for (const role of ROLES) lines.push(`| ${ROLE_NAMES[role]} | ${providersFor(role).map((p) => PROVIDER_NAMES[p]).join(", ")} |`);
  lines.push("");
  return lines.join("\n");
}
