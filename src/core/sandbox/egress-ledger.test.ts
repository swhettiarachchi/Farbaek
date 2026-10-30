import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EGRESS_LOG_PATH, EGRESS_READ_BYTES, EGRESS_SCRIPT, commandPrelude, egressWords, mergeEgress, parseEgressLog, readableHost, summarizeEgress } from "./egress-ledger";

const line = (host: unknown, port: unknown, decision: unknown) => JSON.stringify({ t: 1, host, port, decision });

describe("the prelude before each command", () => {
  const prelude = commandPrelude(["registry.npmjs.org", "PyPI.org"]);

  it("starts the proxy with the session's list, and points the proxy settings at it only once it answers", () => {
    expect(prelude).toContain(`FARBAEK_EGRESS_ALLOW='["registry.npmjs.org","pypi.org"]'`);
    const answers = prelude.lastIndexOf("if (exec 3<>/dev/tcp/127.0.0.1/3998) 2>/dev/null; then");
    expect(answers).toBeGreaterThan(0);
    for (const line of [`: > ${EGRESS_LOG_PATH}`, "export HTTP_PROXY=http://127.0.0.1:3998", "NODE_USE_ENV_PROXY=1"]) expect(prelude.indexOf(line)).toBeGreaterThan(answers);
    expect(prelude.trimEnd().endsWith("unset -f __farbaek_egress")).toBe(true);
  });

  it("quotes a list that holds a quote, and is valid bash", () => {
    expect(commandPrelude(["it's.example"])).toContain(`'["it'\\''s.example"]'`);
    const bash = spawnSync("bash", ["-n"], { input: prelude, encoding: "utf8" });
    if (bash.error) return; // No bash on this machine; the CI runner has it.
    expect(bash.status, bash.stderr).toBe(0);
  });
});

describe("reading the record", () => {
  it("keeps plain hosts, ports and decisions, and counts everything else as unreadable", () => {
    const text = [
      line("registry.npmjs.org", 443, "allowed"),
      line("Evil.Example.", 443, "blocked"),
      line("2606:4700::1", 443, "blocked"),
      "not json",
      line("bad host with spaces", 443, "blocked"),
      line("<script>", 80, "blocked"),
      line("a".repeat(300), 443, "blocked"),
      line("ok.example", 70000, "blocked"),
      line("ok.example", 443, "maybe"),
      line(42, 443, "allowed"),
    ].join("\n");
    expect(parseEgressLog(text)).toEqual({
      attempts: [
        { host: "registry.npmjs.org", port: 443, decision: "allowed" },
        { host: "evil.example", port: 443, decision: "blocked" },
        { host: "2606:4700::1", port: 443, decision: "blocked" },
      ],
      unreadable: 7,
      truncated: false,
    });
    expect(readableHost("xn--bcher-kva.example")).toBe("xn--bcher-kva.example");
    expect(readableHost("bücher.example")).toBeNull();
  });

  it("drops a line cut in half by reading the tail, and says when it read only part", () => {
    const one = line("a.example", 443, "blocked");
    const text = `${one.slice(10)}\n${one}\n`.padEnd(EGRESS_READ_BYTES, " ");
    const r = parseEgressLog(text);
    expect(r.attempts).toEqual([{ host: "a.example", port: 443, decision: "blocked" }]);
    expect(r.unreadable).toBe(0);
    expect(r.truncated).toBe(true);
  });

  it("groups attempts by address, most first, and merges commands", () => {
    const a = summarizeEgress(parseEgressLog([line("registry.npmjs.org", 443, "allowed"), line("registry.npmjs.org", 443, "allowed"), line("evil.example", 443, "blocked")].join("\n")));
    expect(a).toEqual({ allowed: [{ host: "registry.npmjs.org", port: 443, attempts: 2 }], blocked: [{ host: "evil.example", port: 443, attempts: 1 }], unreadable: 0, truncated: false });
    const b = summarizeEgress(parseEgressLog([line("evil.example", 443, "blocked"), line("other.example", 8080, "blocked")].join("\n")));
    expect(mergeEgress([a, null, b])).toEqual({
      allowed: [{ host: "registry.npmjs.org", port: 443, attempts: 2 }],
      blocked: [
        { host: "evil.example", port: 443, attempts: 2 },
        { host: "other.example", port: 8080, attempts: 1 },
      ],
      unreadable: 0,
      truncated: false,
    });
    expect(mergeEgress([null])).toBeNull();
    expect(egressWords(mergeEgress([a, b]))).toBe("Reached registry.npmjs.org. Blocked evil.example, other.example:8080.");
    expect(egressWords(summarizeEgress({ attempts: [], unreadable: 0, truncated: false }))).toBe("Nothing asked for the network.");
    expect(egressWords(null)).toBe("Not recorded.");
  });

  it("keeps at most 50 addresses of each kind, and says so", () => {
    const many = Array.from({ length: 60 }, (_, i) => line(`h${i}.example`, 443, "blocked")).join("\n");
    const s = summarizeEgress(parseEgressLog(many));
    expect(s.blocked).toHaveLength(50);
    expect(s.truncated).toBe(true);
  });
});

describe("the proxy itself", () => {
  let dir: string;
  let proxy: ChildProcess;
  let port = 0;
  let target: net.Server;
  let targetPort = 0;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "farbaek-egress-"));
    writeFileSync(join(dir, "egress.mjs"), EGRESS_SCRIPT);
    target = net.createServer((s) => {
      s.on("error", () => {});
      s.pipe(s);
    });
    await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
    targetPort = (target.address() as net.AddressInfo).port;
    proxy = spawn(process.execPath, [join(dir, "egress.mjs")], {
      env: { ...process.env, FARBAEK_EGRESS_PORT: "0", FARBAEK_EGRESS_ANNOUNCE: "1", FARBAEK_EGRESS_LOG: join(dir, "egress.log"), FARBAEK_EGRESS_ALLOW: '["127.0.0.1"]', FARBAEK_EGRESS_PORTS: `80,443,${targetPort}` },
    });
    port = await new Promise<number>((resolve, reject) => {
      proxy.stdout!.once("data", (d) => resolve(Number(String(d).trim())));
      proxy.once("error", reject);
    });
  }, 20_000);

  afterAll(() => {
    proxy?.kill();
    target?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const talk = (request: string, after?: string) =>
    new Promise<string>((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => s.write(request));
      let got = "";
      s.on("data", (d) => {
        got += String(d);
        if (after && got.includes("200 Connection Established") && !got.includes(after)) s.write(after);
        if (!after || got.includes(after)) {
          s.end();
          resolve(got);
        }
      });
      s.on("error", () => resolve(got));
      s.on("close", () => resolve(got));
    });

  it("refuses an address that isn't on the list, and records it", async () => {
    expect(await talk("CONNECT evil.example:443 HTTP/1.1\r\nHost: evil.example:443\r\n\r\n")).toMatch(/^HTTP\/1\.1 403/);
    expect(await talk("GET http://evil.example/x HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n")).toMatch(/^HTTP\/1\.1 403/);
    expect(await talk("CONNECT 127.0.0.1:22 HTTP/1.1\r\nHost: 127.0.0.1:22\r\n\r\n")).toMatch(/^HTTP\/1\.1 403/);
  });

  it("lets a listed address through, and records it", async () => {
    const got = await talk(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`, "ping");
    expect(got).toContain("200 Connection Established");
    expect(got).toContain("ping");
    const log = parseEgressLog(readFileSync(join(dir, "egress.log"), "utf8"));
    expect(summarizeEgress(log)).toEqual({
      allowed: [{ host: "127.0.0.1", port: targetPort, attempts: 1 }],
      blocked: [
        { host: "127.0.0.1", port: 22, attempts: 1 },
        { host: "evil.example", port: 80, attempts: 1 },
        { host: "evil.example", port: 443, attempts: 1 },
      ],
      unreadable: 0,
      truncated: false,
    });
  });
});
