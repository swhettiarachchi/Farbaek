import { describe, expect, it } from "vitest";
import { costDrivers } from "./costs";
import { planLaunch, type PlannerInput } from "./planner";

const drivers = (input: PlannerInput) => costDrivers(planLaunch(input), input);

describe("what will cost money at launch (ADR 0141)", () => {
  it("names a static site's only driver, bandwidth, with no prices", () => {
    const input = { paths: ["index.html", "styles.css"], texts: {} };
    expect(drivers(input)).toEqual([{ id: "static", title: "Static files only", detail: expect.stringMatching(/bandwidth/), evidence: "2 files" }]);
    expect(JSON.stringify(drivers(input))).not.toMatch(/\$\d/);
  });

  it("finds server code, functions, optimised images, scheduled jobs, the build and each outside service in a Next.js app", () => {
    const pkg = JSON.stringify({ scripts: { build: "next build", start: "next start" }, dependencies: { next: "16.0.0", stripe: "17.0.0", "@supabase/supabase-js": "2.0.0", "@anthropic-ai/sdk": "0.60.0" } });
    const input: PlannerInput = {
      paths: ["package.json", "next.config.ts", "vercel.json", "app/page.tsx", "app/api/checkout/route.ts", "app/api/webhooks/stripe/route.ts", "app/gallery/page.tsx"],
      texts: { "package.json": pkg, "next.config.ts": "export default {};", "vercel.json": '{ "crons": [{ "path": "/api/digest", "schedule": "0 8 * * *" }] }', "app/gallery/page.tsx": 'import Image from "next/image";' },
    };
    const found = drivers(input);
    expect(found.map((d) => d.id)).toEqual(["server", "functions", "images", "scheduled", "build", "service-database", "service-payments", "service-ai"]);
    expect(found.find((d) => d.id === "functions")).toMatchObject({ title: "2 functions that run per request", evidence: "app/api/checkout/route.ts, app/api/webhooks/stripe/route.ts" });
    expect(found.find((d) => d.id === "images")!.evidence).toBe("app/gallery/page.tsx");
    expect(found.find((d) => d.id === "service-payments")).toMatchObject({ detail: expect.stringMatching(/fee on each transaction/), evidence: "stripe" });
    expect(found.find((d) => d.id === "service-ai")!.detail).toMatch(/Farbaek's usage doesn't cover it/);
  });

  it("reads Netlify's scheduled functions too", () => {
    const input: PlannerInput = { paths: ["index.html", "netlify.toml", "netlify/functions/digest.ts"], texts: { "netlify.toml": '[functions."digest"]\n  schedule = "@daily"\n' } };
    expect(drivers(input).map((d) => d.id)).toEqual(["static", "functions", "scheduled"]);
  });
});
