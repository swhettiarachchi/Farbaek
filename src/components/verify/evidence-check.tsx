"use client";

import { CheckCircleIcon, FileArrowUpIcon, FileMagnifyingGlassIcon, PackageIcon, SealCheckIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useState, type DragEvent } from "react";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { SealReveal } from "@/components/proof/seal-reveal";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { CAPSULE_LIMITS } from "@/config/workspace";
import { openCapsule, type OpenedCapsule } from "@/core/mesh/capsule";
import { EVIDENCE_LABELS, inspectEvidence, matchFile, type EvidenceFile, type EvidenceSignature, type Inspection } from "@/core/proof/inspect";
import type { PublicSigningKey } from "@/core/trust/dsse";
import { formatBytes } from "@/core/workspace/files";

type Result = { type: "evidence"; name: string; inspection: Inspection } | { type: "capsule"; name: string; opened: OpenedCapsule } | { type: "error"; message: string };

/** Evidence files are small; this keeps a stray large file from freezing the tab. */
const MAX_JSON_BYTES = 8 * 1024 * 1024;

/** A time from a file someone was sent: shown as local time only when it's a real date. */
function When({ iso }: { iso: string }) {
  return Number.isNaN(Date.parse(iso)) ? <>{iso}</> : <LocalTime iso={iso} />;
}

async function sha256OfBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

const KINDS = [
  { label: "ProofPacks", body: "What was approved, the exact content applied, and the checks that ran." },
  { label: "Recovery receipts", body: "A change that was undone, file by file." },
  { label: "Check receipts", body: "A check run in a test space, with its exit codes." },
  { label: "Security reports", body: "A project's score and every finding." },
  { label: "Workspace Capsules", body: "A project packed to move, with a BLAKE3 hash for every file." },
];

/**
 * Portable Proof: checks Farbaek evidence in the visitor's browser. Files are
 * read here and never sent anywhere; the page makes no request with them.
 */
/** Farbaek's published signing keys (ADR 0062), or null when they can't be loaded. */
async function loadKeys(): Promise<PublicSigningKey[] | null> {
  try {
    const r = await fetch("/.well-known/farbaek-keys.json", { cache: "no-store" });
    if (!r.ok) return null;
    const body: unknown = await r.json();
    const keys = typeof body === "object" && body !== null ? (body as { keys?: unknown }).keys : null;
    if (!Array.isArray(keys)) return null;
    return keys.filter((k): k is PublicSigningKey => typeof k?.keyid === "string" && typeof k?.publicKey === "string");
  } catch {
    return null;
  }
}

export function EvidenceCheck() {
  const id = useId();
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [pasted, setPasted] = useState("");
  const [digest, setDigest] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function checkFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isZip(bytes)) {
        if (bytes.length > CAPSULE_LIMITS.maxTotalBytes + 512 * 1024) setResult({ type: "error", message: `That zip is ${formatBytes(bytes.length)}; Capsules up to ${formatBytes(CAPSULE_LIMITS.maxTotalBytes)} can be checked here.` });
        else setResult({ type: "capsule", name: file.name, opened: await openCapsule(bytes, CAPSULE_LIMITS) });
        return;
      }
      if (bytes.length > MAX_JSON_BYTES) {
        setResult({ type: "error", message: "That file is too large to be a Farbaek proof file." });
        return;
      }
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        setResult({ type: "error", message: "That file isn't JSON or a Capsule. Proof files from Farbaek end in .json; Capsules in .capsule.zip." });
        return;
      }
      setResult({ type: "evidence", name: file.name, inspection: await inspectEvidence(json, undefined, await loadKeys()) });
    } finally {
      setBusy(false);
    }
  }

  async function checkPasted() {
    let json: unknown;
    try {
      json = JSON.parse(pasted);
    } catch {
      setResult({ type: "error", message: "That text isn't valid JSON. Paste the whole statement, from the first { to the last }." });
      return;
    }
    setBusy(true);
    setResult({ type: "evidence", name: "Pasted statement", inspection: await inspectEvidence(json, digest.trim() || undefined, await loadKeys()) });
    setBusy(false);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    void checkFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="grid gap-4">
        <fieldset className="grid min-w-0 gap-2">
          <legend className="sr-only">How to give the proof</legend>
          <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 shadow-e1 sm:w-auto">
            {(
              [
                ["file", "A file"],
                ["paste", "Paste JSON"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="relative flex-1 sm:flex-none">
                <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => setMode(value)} className="peer sr-only" />
                <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-5 text-sm text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "file" ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-accent ${dragging ? "border-accent bg-accent/[0.04]" : "border-line-strong/50 bg-surface hover:border-accent/60"} ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <FileArrowUpIcon size={36} className="text-accent" aria-hidden />
            <span className="text-[0.9375rem] font-medium">{busy ? "Checking…" : "Drop a proof file or a Capsule"}</span>
            <span className="max-w-[34ch] text-sm text-ink-3">Or choose one. A ProofPack or receipt (.json), or a .capsule.zip.</span>
            <input type="file" accept=".json,application/json,.zip,application/zip" className="sr-only" onChange={(e) => void checkFile(e.target.files?.[0])} />
          </label>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void checkPasted();
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Statement JSON</span>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={9}
                spellCheck={false}
                required
                className="min-h-44 w-full rounded-sm border border-line bg-surface px-3.5 py-3 font-mono text-base leading-relaxed text-ink outline-none focus:border-accent/60 sm:text-[0.8125rem]"
                placeholder='{ "_type": "https://in-toto.io/Statement/v1", … }'
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Digest you were given</span>
              <input
                value={digest}
                onChange={(e) => setDigest(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="sha256:…"
                className="h-11 w-full min-w-0 rounded-sm border border-line bg-surface px-3.5 font-mono text-base text-ink outline-none focus:border-accent/60 sm:text-sm"
              />
              <span className="text-xs text-ink-3">Optional when the JSON already holds its digest.</span>
            </label>
            <button type="submit" disabled={busy || !pasted.trim()} className={buttonClasses("primary", "md", "justify-self-start")}>
              <FileMagnifyingGlassIcon size={16} aria-hidden /> Check it
            </button>
          </form>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-3">
          <CheckCircleIcon size={14} className="mt-0.5 shrink-0 text-verified" aria-hidden />
          Checked here, in your browser. Nothing you choose or paste is uploaded.
        </p>
      </div>

      <section aria-live="polite" aria-label="Result" className="min-w-0 rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-7">
        {!result ? (
          <div className="grid gap-4">
            <p className="text-[0.8125rem] font-medium text-ink-3">What can be checked</p>
            <ul className="grid gap-3">
              {KINDS.map((k) => (
                <li key={k.label} className="grid gap-0.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <span className="text-[0.9375rem] font-medium">{k.label}</span>
                  <span className="text-sm text-ink-2">{k.body}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : result.type === "error" ? (
          <Failure message={result.message} />
        ) : result.type === "capsule" ? (
          <CapsuleResult name={result.name} opened={result.opened} />
        ) : !result.inspection.ok ? (
          <Failure message={result.inspection.message} />
        ) : (
          <EvidenceResult inspection={result.inspection} />
        )}
      </section>
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <div role="alert" className="grid gap-2">
      <p className="flex items-start gap-2 text-[0.9375rem] font-medium text-failed">
        <XCircleIcon size={20} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> Not checked
      </p>
      <p className="text-sm leading-relaxed text-ink-2">{message}</p>
    </div>
  );
}

/**
 * Only a signature proves Farbaek recorded it (ADR 0062); a digest alone
 * proves nothing in it changed. A bad signature outweighs a matching digest.
 */
function Verdict({ intact, signature, label }: { intact: boolean | null; signature: EvidenceSignature["status"]; label: string }) {
  const failed = (text: React.ReactNode) => (
    <p className="flex items-start gap-2.5 text-lg font-medium leading-snug text-failed">
      <XCircleIcon size={24} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
  const passed = (text: React.ReactNode) => (
    <p className="flex items-start gap-2.5 text-lg font-medium leading-snug">
      <CheckCircleIcon size={24} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
      <span>{text}</span>
    </p>
  );
  if (intact === false) return failed(<>Changed. This {label} isn&apos;t what Farbaek recorded: its digest doesn&apos;t match.</>);
  if (signature === "bad") return failed(<>Not what Farbaek signed. Don&apos;t rely on this {label}.</>);
  if (signature === "signed") return passed(<>Intact. This {label} is exactly what Farbaek recorded.</>);
  if (intact === true) return passed(<>Intact. This {label} matches its digest, so nothing in it changed.</>);
  // Not compared is neither a pass nor a failure, so it's words alone (ADR 0180).
  return <p className="text-lg font-medium leading-snug text-unverified">This {label} was read, but not compared. Paste the digest you were given to check it.</p>;
}

/** Who signed it, in words, never by colour alone: an icon only for a signature that checks out or doesn't. */
function SignatureLine({ signature: s }: { signature: EvidenceSignature }) {
  const line = (icon: React.ReactNode, text: React.ReactNode, tone = "text-ink-2") => <p className={`flex items-start gap-2 text-sm leading-relaxed ${tone}`}>{icon}<span>{text}</span></p>;
  switch (s.status) {
    case "signed":
      return line(
        <SealCheckIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />,
        <>
          Signed by Farbaek with key <span className="break-all font-mono text-[0.8125rem]">{s.keyid}</span>, which only Farbaek&apos;s server holds.
        </>,
        "text-ink",
      );
    case "bad":
      return line(<XCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />, <>Signature doesn&apos;t check out. {s.reason}</>, "text-failed");
    case "unknown_key":
      return line(
        <WarningCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-approval" aria-hidden />,
        <>
          Signed with a key Farbaek doesn&apos;t publish (<span className="break-all font-mono text-[0.8125rem]">{s.keyid}</span>), so the signature can&apos;t be trusted.
        </>,
      );
    // Neither a pass nor a failure: words alone (ADR 0180).
    case "unchecked":
      return line(null, "Signed, but Farbaek's keys couldn't be loaded to check the signature. Try again.");
    default:
      return line(null, "Not signed. Its digest still shows whether it changed, but not who recorded it.");
  }
}

function DigestRow({ label, value, match }: { label: string; value: string; match: boolean | null }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`break-all font-mono text-[0.8125rem] leading-relaxed ${match === false ? "text-failed" : "text-ink"}`}>sha256:{value}</dd>
    </div>
  );
}

function EvidenceResult({ inspection: r }: { inspection: Extract<Inspection, { ok: true }> }) {
  const label = EVIDENCE_LABELS[r.kind];
  const [match, setMatch] = useState<{ name: string; hits: EvidenceFile[] } | null>(null);
  const trusted = r.signature.status !== "bad" && r.signature.status !== "unknown_key";
  const sealed = (r.intact === true || r.signature.status === "signed") && trusted && r.kind === "proofpack" && r.status === "verified";

  async function matchOne(file: File | undefined) {
    if (!file) return;
    const sha = await sha256OfBytes(await file.arrayBuffer());
    setMatch({ name: file.name, hits: matchFile(r.summary, sha) });
  }

  return (
    <div className="grid gap-6 motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className={`grid gap-5 ${sealed ? "sm:grid-cols-[minmax(0,1fr)_150px] sm:items-start" : ""}`}>
        <div className="grid min-w-0 gap-3">
          <Verdict intact={r.intact} signature={r.signature.status} label={label} />
          {r.sample ? (
            <div>
              <StatusBadge status="simulated" label="Sample data" />
            </div>
          ) : null}
          <SignatureLine signature={r.signature} />
          {r.recordedAt ? (
            <p className="text-sm text-ink-3">
              Recorded <When iso={r.recordedAt} />
            </p>
          ) : null}
        </div>
        {sealed ? (
          <SealReveal hash={r.computed} className="justify-self-center">
            <ProofPackSeal hash={r.computed} caption={r.sample ? "Sample ProofPack" : "ProofPack verified"} size={150} idSuffix="-verify" className="size-[150px]" />
          </SealReveal>
        ) : null}
      </div>

      <dl className="grid gap-3 rounded-sm border border-line bg-surface-raised/50 p-4">
        {r.claimed ? <DigestRow label="The digest it claims" value={r.claimed} match={r.intact} /> : null}
        <DigestRow label="The digest of what you gave" value={r.computed} match={r.intact} />
      </dl>

      <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {r.summary.facts.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-ink-3">{f.label}</dt>
            <dd className={`min-w-0 break-words ${f.mono ? "font-mono text-[0.8125rem]" : ""}`}>{f.time ? <When iso={f.value} /> : f.value}</dd>
          </div>
        ))}
      </dl>

      {r.summary.files.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-[0.9375rem] font-medium">Files</h3>
          <ul className="divide-y divide-line rounded-sm border border-line">
            {r.summary.files.map((f) => (
              <li key={`${f.path}-${f.sha256}`} className="grid gap-0.5 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <span className="min-w-0 truncate font-mono text-[0.8125rem]" title={f.path}>
                  {f.path}
                </span>
                <span className="text-xs text-ink-3" title={`sha256:${f.sha256}`}>
                  {f.note}
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 justify-self-start rounded-full border border-line bg-surface px-4 text-sm font-medium shadow-e1 transition-colors hover:bg-canvas-2 has-focus-visible:outline-2 has-focus-visible:outline-accent">
            <FileMagnifyingGlassIcon size={16} aria-hidden /> Match a file to this record
            <input type="file" className="sr-only" onChange={(e) => void matchOne(e.target.files?.[0])} />
          </label>
          {match ? (
            match.hits.length > 0 ? (
              <p className="flex items-start gap-2 text-sm">
                <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                <span>
                  <span className="font-medium">{match.name}</span> is exactly the content recorded for <span className="break-all font-mono text-[0.8125rem]">{match.hits.map((h) => h.path).join(", ")}</span>.
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm">
                <XCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
                <span>
                  <span className="font-medium">{match.name}</span> doesn&apos;t match any file in this record. A single changed character gives a different hash.
                </span>
              </p>
            )
          ) : (
            <p className="text-xs text-ink-3">Its SHA-256 is computed here and compared with the files above.</p>
          )}
        </div>
      ) : null}

      {r.summary.checks.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-[0.9375rem] font-medium">Checks</h3>
          <ul className="grid gap-2">
            {r.summary.checks.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-start gap-2.5 text-sm">
                {c.status === "passed" ? (
                  <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-label="Passed" />
                ) : c.status === "failed" ? (
                  <XCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-label="Failed" />
                ) : (
                  // Not run is said in words beside the name; the space keeps the names in line.
                  <span className="size-[18px] shrink-0" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-ink-3">
                    {c.status === "not_run" ? "didn't run" : c.status === "failed" ? (c.exitCode !== null ? `failed (exit code ${c.exitCode})` : "failed") : "passed"}
                  </span>
                  {c.command ? (
                    <span className="block truncate font-mono text-xs text-ink-3" title={c.command}>
                      {c.command}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.summary.links.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-[0.9375rem] font-medium">Linked proof</h3>
          <ul className="grid gap-1.5 text-sm">
            {r.summary.links.map((l) => (
              <li key={l.digest} className="grid gap-0.5">
                <span className="text-ink-2">{l.label}</span>
                <span className="break-all font-mono text-xs text-ink-3">sha256:{l.digest}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.summary.limits.length > 0 ? (
        <details className="rounded-sm border border-line bg-surface-raised/50 px-4 py-1 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">What this record says it doesn&apos;t prove</summary>
          <ul className="mb-3 mt-1 grid gap-2 pl-4 text-ink-2">
            {r.summary.limits.map((l) => (
              <li key={l} className="list-disc">
                {l}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function CapsuleResult({ name, opened }: { name: string; opened: OpenedCapsule }) {
  if (!opened.ok) {
    return (
      <div role="alert" className="grid gap-3">
        <p className="flex items-start gap-2.5 text-lg font-medium leading-snug text-failed">
          <XCircleIcon size={24} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> This Workspace Capsule didn&apos;t pass its checks.
        </p>
        <ul className="grid gap-1.5 pl-5 text-sm text-ink-2">
          {opened.problems.map((p, i) => (
            <li key={i} className="list-disc break-words">
              {p}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const m = opened.manifest;
  return (
    <div className="grid gap-6 motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-start">
        <div className="grid min-w-0 gap-3">
          <p className="flex items-start gap-2.5 text-lg font-medium leading-snug">
            <CheckCircleIcon size={24} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>Intact. Every file in this Workspace Capsule matches its BLAKE3 hash.</span>
          </p>
          <p className="truncate text-sm text-ink-3" title={name}>
            {name}
          </p>
        </div>
        <SealReveal hash={opened.digest} className="justify-self-center">
          <ProofPackSeal hash={opened.digest} caption="Capsule verified" hashText={`blake3:${opened.digest.slice(0, 8)}…${opened.digest.slice(-6)}`} size={150} idSuffix="-verify" className="size-[150px]" />
        </SealReveal>
      </div>
      <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-ink-3">From</dt>
        <dd className="min-w-0 break-words">{m.source.projectName}</dd>
        <dt className="text-ink-3">Packed</dt>
        <dd>
          <When iso={m.createdAt} />
        </dd>
        <dt className="text-ink-3">Files</dt>
        <dd>
          {m.totals.files.toLocaleString("en-US")}, {formatBytes(m.totals.bytes)}
        </dd>
        <dt className="text-ink-3">Left out when packed</dt>
        <dd>{m.excluded.length === 0 ? "Nothing" : m.excluded.length.toLocaleString("en-US")}</dd>
      </dl>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-ink-2">Technical details</summary>
        <p className="text-xs text-ink-3">
          The Capsule&apos;s BLAKE3 digest: <span className="break-all font-mono">blake3:{opened.digest}</span>
        </p>
      </details>
      <Link href="/app/mesh" className={buttonClasses("secondary", "sm", "justify-self-start")}>
        <PackageIcon size={16} aria-hidden /> Open it in a workspace
      </Link>
    </div>
  );
}
