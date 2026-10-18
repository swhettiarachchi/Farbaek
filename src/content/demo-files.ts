/**
 * Sample source files for the demo workspace's Storefront project. Sample
 * data, shown only in the read-only demo, and labelled there.
 */
export const DEMO_FILES_PROJECT_ID = "00000000-0000-4000-8000-00000000a001";

export interface DemoFile {
  path: string;
  content: string;
  updatedHoursAgo: number;
  /** Earlier revisions, oldest first. The current content is the next revision. */
  history?: { content: string; updatedHoursAgo: number }[];
}

export const DEMO_FILES: DemoFile[] = [
  {
    path: "README.md",
    updatedHoursAgo: 120,
    content: `# Storefront (sample)

A small sample shop used by the Farbaek demo workspace. Nothing here is a real store.

## Scripts

- \`pnpm dev\` starts the dev server.
- \`pnpm test\` runs the unit tests.
`,
  },
  {
    path: "package.json",
    updatedHoursAgo: 120,
    content: `{
  "name": "storefront-sample",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "16.4.0",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "typescript": "6.0.3",
    "vitest": "5.0.3"
  }
}
`,
  },
  {
    path: "src/app/page.tsx",
    updatedHoursAgo: 72,
    content: `import { ProductCard } from "@/components/product-card";
import { listProducts } from "@/lib/products";

export default async function Home() {
  const products = await listProducts();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-medium">Harbour Lane goods</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </main>
  );
}
`,
  },
  {
    path: "src/components/product-card.tsx",
    updatedHoursAgo: 72,
    content: `import type { Product } from "@/lib/products";
import { formatPrice } from "@/lib/cart";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="rounded-2xl border p-4">
      <h2 className="font-medium">{product.name}</h2>
      <p className="mt-1 text-sm text-neutral-600">{product.description}</p>
      <p className="mt-3 font-mono">{formatPrice(product.priceCents)}</p>
    </article>
  );
}
`,
  },
  {
    path: "src/lib/products.ts",
    updatedHoursAgo: 30,
    history: [
      {
        updatedHoursAgo: 96,
        content: `export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
}

const PRODUCTS: Product[] = [
  { id: "p-1", name: "Canvas tote", description: "Heavy cotton tote with an inside pocket.", priceCents: 2400 },
  { id: "p-2", name: "Enamel mug", description: "Holds 350 ml. Dishwasher safe.", priceCents: 1600 },
];

export async function listProducts(): Promise<Product[]> {
  return PRODUCTS;
}
`,
      },
    ],
    content: `export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
}

const PRODUCTS: Product[] = [
  { id: "p-1", name: "Canvas tote", description: "Heavy cotton tote with an inside pocket.", priceCents: 2400, stock: 18 },
  { id: "p-2", name: "Enamel mug", description: "Holds 350 ml. Dishwasher safe.", priceCents: 1600, stock: 42 },
  { id: "p-3", name: "Wool beanie", description: "Ribbed knit, one size.", priceCents: 2200, stock: 0 },
];

export async function listProducts(): Promise<Product[]> {
  return PRODUCTS;
}
`,
  },
  {
    path: "src/lib/cart.ts",
    updatedHoursAgo: 70,
    content: `import type { Product } from "./products";

export interface CartLine {
  product: Product;
  quantity: number;
}

export function addToCart(lines: CartLine[], product: Product, quantity = 1): CartLine[] {
  if (quantity < 1) throw new Error("Quantity must be at least 1");
  const existing = lines.find((l) => l.product.id === product.id);
  if (existing) {
    return lines.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + quantity } : l));
  }
  return [...lines, { product, quantity }];
}

export function cartTotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
`,
  },
  {
    path: "src/lib/cart.test.ts",
    updatedHoursAgo: 70,
    content: `import { describe, expect, it } from "vitest";
import { addToCart, cartTotalCents } from "./cart";

const mug = { id: "p-2", name: "Enamel mug", description: "", priceCents: 1600, stock: 42 };

describe("cart", () => {
  it("adds a product and totals the cart", () => {
    const lines = addToCart([], mug, 2);
    expect(cartTotalCents(lines)).toBe(3200);
  });

  it("merges repeat additions into one line", () => {
    const lines = addToCart(addToCart([], mug), mug);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(2);
  });
});
`,
  },
];
