import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScopeDriftCard } from "./scope-drift-card";

const render = (props: Parameters<typeof ScopeDriftCard>[0]) => renderToStaticMarkup(createElement(ScopeDriftCard, props));

describe("ScopeDriftCard", () => {
  const approvedAt = "2026-10-14T09:00:00.000Z";

  it("says plainly when nothing changed or everything stayed in scope", () => {
    expect(render({ approvedAt, changes: 0, findings: [] })).toContain("No files changed since the contract was approved.");
    expect(render({ approvedAt, changes: 3, findings: [] })).toContain("3 file changes since approval, all inside the contract.");
  });

  it("lists each drifting change with its operation, reasons and origin, not by colour alone", () => {
    const html = render({
      approvedAt,
      changes: 4,
      findings: [{ path: "src/app/page.tsx", operation: "files.edit", reasons: ["outside_paths"], at: "2026-10-14T10:00:00.000Z", viaProposal: false }],
    });
    expect(html).toContain("1 of 4 changes fall outside the contract");
    expect(html).toContain("src/app/page.tsx");
    expect(html).toContain("files.edit");
    expect(html).toContain("outside the contract&#x27;s paths");
    expect(html).toContain("Direct change");
    expect(html).toContain("aria-hidden");
  });
});
