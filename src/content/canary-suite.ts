/**
 * The Model Change Canary's tasks (ADR 0090): Farbaek's own samples, never
 * customer work. Each is a small project, an approved contract and a change
 * to propose, chosen to show how a model handles a site edit, a code fix
 * with a test, and a change across two files. Labelled "sample" wherever a
 * report shows them.
 */
import type { IntentContract } from "@/core/realityloop/contract";

export interface CanaryTask {
  id: string;
  title: string;
  projectName: string;
  files: { path: string; content: string }[];
  /** The files the model may change: the brief's context. */
  context: string[];
  notes: string;
  contract: IntentContract;
}

const base = (outcome: string, resources: string[], extra: Partial<IntentContract> = {}): IntentContract => ({
  schema: "farbaek.intent-contract/v1",
  version: 1,
  outcome,
  scope: { organizationId: "org_canary", projectId: "prj_canary", resources },
  allowedOperations: ["files.edit", "files.create"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [],
  approvals: [{ gate: "before_execution", role: "contributor" }],
  limits: { maxRecords: 5 },
  requiredChecks: [],
  recovery: "Restore the previous file revisions from history.",
  ...extra,
});

export const CANARY_SUITE: readonly CanaryTask[] = [
  {
    id: "site-section",
    title: "Add an opening hours section to the bakery's page",
    projectName: "Sample bakery site",
    files: [
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sunrise Bakery</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header><h1>Sunrise Bakery</h1><p>Sourdough, baked before dawn.</p></header>
    <main>
      <section id="menu"><h2>Menu</h2><ul><li>Country loaf</li><li>Rye</li><li>Cardamom buns</li></ul></section>
    </main>
    <footer><p>12 Harbour Lane</p></footer>
  </body>
</html>
`,
      },
      { path: "styles.css", content: `body { font-family: system-ui, sans-serif; margin: 0; color: #1f2937; }\nheader, main, footer { max-width: 40rem; margin: 0 auto; padding: 1.5rem; }\nh2 { font-size: 1.25rem; }\n` },
    ],
    context: ["index.html", "styles.css"],
    notes: "Open Tuesday to Sunday, 7am to 3pm. Closed on Mondays.",
    contract: base("The page shows the bakery's opening hours below the menu.", ["index.html", "styles.css"], {
      protectedInvariants: [{ id: "inv-1", statement: "The menu and the address are unchanged." }],
      acceptanceCriteria: [{ id: "ac-1", statement: "An opening hours section lists Tuesday to Sunday, 7am to 3pm, and says Monday is closed.", verification: "read_back" }],
    }),
  },
  {
    id: "code-fix",
    title: "Reject fractional quantities in the cart",
    projectName: "Sample storefront",
    files: [
      {
        path: "src/lib/cart.ts",
        content: `export interface Line {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export function addLine(lines: Line[], line: Line): Line[] {
  if (line.quantity < 1) throw new Error("Quantity must be at least 1.");
  return [...lines, line];
}

export function total(lines: Line[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}
`,
      },
      {
        path: "src/lib/cart.test.ts",
        content: `import { describe, expect, it } from "vitest";
import { addLine, total } from "./cart";

describe("cart", () => {
  it("adds lines and totals them", () => {
    const lines = addLine([], { sku: "loaf", quantity: 2, unitPrice: 5 });
    expect(total(lines)).toBe(10);
  });
});
`,
      },
    ],
    context: ["src/lib/cart.ts", "src/lib/cart.test.ts"],
    notes: "",
    contract: base("Adding a line with a fractional quantity is refused with a clear error.", ["src/lib"], {
      protectedInvariants: [{ id: "inv-1", statement: "Prices and totals for whole quantities are unchanged." }],
      acceptanceCriteria: [
        { id: "ac-1", statement: "addLine throws for a quantity of 1.5.", verification: "test" },
        { id: "ac-2", statement: "The existing cart test still passes.", verification: "test" },
      ],
      requiredChecks: ["pnpm test"],
    }),
  },
  {
    id: "two-file-rename",
    title: "Rename formatPrice to formatMoney everywhere",
    projectName: "Sample storefront",
    files: [
      { path: "src/lib/format.ts", content: `export function formatPrice(cents: number): string {\n  return \`$\${(cents / 100).toFixed(2)}\`;\n}\n` },
      {
        path: "src/components/price-tag.ts",
        content: `import { formatPrice } from "../lib/format";\n\nexport function priceTag(cents: number): string {\n  return \`<span class="price">\${formatPrice(cents)}</span>\`;\n}\n`,
      },
    ],
    context: ["src/lib/format.ts", "src/components/price-tag.ts"],
    notes: "Keep the output exactly the same.",
    contract: base("formatPrice is called formatMoney, and every import uses the new name.", ["src/lib", "src/components"], {
      protectedInvariants: [{ id: "inv-1", statement: "Formatted prices read exactly as before." }],
      acceptanceCriteria: [{ id: "ac-1", statement: "No file refers to formatPrice.", verification: "read_back" }],
    }),
  },
];
