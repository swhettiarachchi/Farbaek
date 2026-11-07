import { ArrowRightIcon, DownloadSimpleIcon, SealCheckIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CommandBlock } from "@/components/verify/command-block";
import { IN_TOTO_STATEMENT_TYPE, LEGACY_PROOFPACK_PREDICATE_TYPE, PROOFPACK_PREDICATE_TYPE } from "@/core/proof/proofpack";
import { IN_TOTO_PAYLOAD_TYPE } from "@/core/trust/dsse";

/**
 * What the ProofPack predicate URI points at (ADR 0062): the format of a
 * ProofPack, its digest and its signature, and how to check one with
 * standard tools. Field names here are the ones `buildProofPack` writes.
 */
export const metadata: Metadata = {
  title: "ProofPack format",
  description: "The ProofPack format, version 1: an in-toto statement, its SHA-256 digest and Farbaek's Ed25519 signature, and how to check one without Farbaek.",
};

const ENVELOPE: { term: string; value: string; body: string }[] = [
  { term: "Statement", value: IN_TOTO_STATEMENT_TYPE, body: "An in-toto Statement v1. Its subjects are the files the change wrote, each by path and the SHA-256 of its exact content." },
  {
    term: "Predicate type",
    value: PROOFPACK_PREDICATE_TYPE,
    body: `ProofPacks recorded before 24 October 2026 carry ${LEGACY_PROOFPACK_PREDICATE_TYPE}, with the same fields.`,
  },
  { term: "Digest", value: "sha256(canonical JSON)", body: "The SHA-256, in hex, of the whole statement written as RFC 8785 canonical JSON. Change one character and it no longer matches." },
  {
    term: "Signature",
    value: IN_TOTO_PAYLOAD_TYPE,
    body: "A DSSE envelope. Its payload is the same canonical JSON, so the payload's SHA-256 is the digest. The signature is Ed25519 over DSSE's pre-authentication encoding of the payload.",
  },
  {
    term: "Keys",
    value: "/.well-known/farbaek-keys.json",
    body: "Farbaek's public keys. A key id is farbaek- and the first 16 hex characters of the SHA-256 of the raw 32-byte public key.",
  },
];

const FIELDS: { name: string; body: string }[] = [
  { name: "schema", body: "Always farbaek.proofpack/v1." },
  { name: "status", body: "verified, partially_verified, unverified or failed, from real exit codes only. A change with no checks run is unverified, never verified." },
  { name: "task", body: "The ids of the task, its workspace and its project." },
  { name: "contract", body: "The version and SHA-256 of the intent contract that was approved." },
  { name: "proposal", body: "The change proposal's id and SHA-256, and the model that drafted it, or null." },
  { name: "policy", body: "The policy decision, the policy's version and its findings, or null when none was recorded." },
  { name: "approval", body: 'Who approved, when, and the SHA-256 of what was applied. by: "policy" with autonomyLevel: 2 or 3 means the workspace\'s policy approved it, at that level of autonomy.' },
  { name: "changes", body: "Each file written: its path, create or edit, the revision it was based on, and the SHA-256 of its content." },
  { name: "checks", body: "Each required check: its name, command, exit code (null when it didn't run) and passed, failed or not_run." },
  { name: "execution", body: "sandboxed, with the sandbox provider, or review_only, with the reason checks didn't run." },
  { name: "limits", body: "What the record doesn't prove, in plain sentences." },
  { name: "createdAt", body: "When it was recorded, in ISO 8601 UTC." },
  { name: "previous", body: "The digest of the project's previous ProofPack, so a project's ProofPacks form a chain. null for the first." },
  {
    name: "verification",
    body: "Only on a ProofPack a check run recorded: the run's receipt digest, the ProofPack of the change it checked, and filesMatched: true, meaning the sandbox held exactly the applied content.",
  },
];

const STEPS: { title: string; label: string; command: string; after: string }[] = [
  {
    title: "Take out what Farbaek signed, and hash it",
    label: "take out the signed statement",
    command: "jq -r .dsse.payload proofpack.json | base64 -d > payload.json\nsha256sum payload.json",
    after: "The hash equals the file's digest. payload.json is exactly the statement Farbaek signed, so read that one rather than the copy beside it.",
  },
  {
    title: "Rebuild the bytes the signature covers",
    label: "rebuild the signed bytes",
    command: `type=${IN_TOTO_PAYLOAD_TYPE}\nprintf 'DSSEv1 %d %s %d ' \${#type} "$type" $(wc -c < payload.json) \\\n  > signed.bin\ncat payload.json >> signed.bin`,
    after: "This is DSSE's pre-authentication encoding: the payload type and the payload, each after its length in bytes.",
  },
  {
    title: "Fetch Farbaek's key for that signature",
    label: "fetch Farbaek's key",
    command: [
      "id=$(jq -r '.dsse.signatures[0].keyid' proofpack.json)",
      "curl -s https://www.farbaek.com/.well-known/farbaek-keys.json \\",
      "  | jq -r --arg id \"$id\" '.keys[] | select(.keyid == $id) | .publicKey' \\",
      "  | base64 -d > farbaek.key",
      "prefix='\\060\\052\\060\\005\\006\\003\\053\\145\\160\\003\\041\\000'",
      '{ printf "$prefix"; cat farbaek.key; } > farbaek.der',
    ].join("\n"),
    after: "The printf adds the standard prefix that turns a raw Ed25519 key into a key file OpenSSL reads. No key found means Farbaek doesn't publish the key that signed it.",
  },
  {
    title: "Check the signature",
    label: "check the signature",
    command: "jq -r '.dsse.signatures[0].sig' proofpack.json | base64 -d > sig.bin\nopenssl pkeyutl -verify -pubin -inkey farbaek.der -keyform DER \\\n  -rawin -in signed.bin -sigfile sig.bin",
    after: "OpenSSL prints \"Signature Verified Successfully\". If any byte changed, it prints \"Signature Verification Failure\".",
  },
];

const PROVES = [
  { icon: SealCheckIcon, title: "Nothing changed", body: "A matching digest shows the record is exactly as it was made." },
  { icon: SealCheckIcon, title: "Farbaek recorded it", body: "A valid signature shows Farbaek's server recorded it. ProofPacks recorded before signing started have none." },
  {
    icon: WarningCircleIcon,
    title: "Not that the software is right",
    body: "A ProofPack says which checks ran and what they returned. It doesn't show that other claims inside are true, or that the software has no other faults.",
  },
];

export default function ProofPackFormatPage() {
  return (
    <>
      <section className="pt-14 pb-10 sm:pt-20 lg:pt-24">
        <Container>
          <h1 className="max-w-[18ch] text-balance text-[2.5rem] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[3.5rem]">The ProofPack format, version 1.</h1>
          <p className="mt-5 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-2">
            Every change Farbaek applies, and every check run of it, leaves a ProofPack: a record of what was approved, what changed and what the checks returned. This is how one
            is built, so anyone can read and check it without Farbaek.
          </p>
          <p className="mt-6 inline-flex max-w-full rounded-full border border-line bg-surface px-4 py-2 font-mono text-[0.8125rem] break-all text-ink">{PROOFPACK_PREDICATE_TYPE}</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1">
            <Link href="/verify" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              Check one on the verify page <ArrowRightIcon size={14} aria-hidden />
            </Link>
            <a href="/verify/sample.json" download className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline">
              <DownloadSimpleIcon size={16} aria-hidden /> Download the sample ProofPack
            </a>
          </div>
        </Container>
      </section>

      <section aria-labelledby="envelope-title" className="border-t border-line py-14 lg:py-20">
        <Container>
          <h2 id="envelope-title" className="text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            The statement, its digest and its signature
          </h2>
          <dl className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line">
            {ENVELOPE.map((e) => (
              <div key={e.term} className="grid gap-2 bg-surface p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
                <dt className="text-[0.9375rem] font-medium">{e.term}</dt>
                <dd className="grid min-w-0 gap-1.5">
                  <span className="font-mono text-[0.8125rem] break-all text-ink">{e.value}</span>
                  <span className="text-[0.9375rem] leading-relaxed text-ink-2">{e.body}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="fields-title" className="border-t border-line bg-surface py-14 lg:py-20">
        <Container>
          <h2 id="fields-title" className="text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            What the predicate records
          </h2>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">The fields inside the statement&apos;s predicate.</p>
          <dl className="mt-8 grid gap-x-10 gap-y-5 md:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.name} className="grid content-start gap-1 border-t border-line pt-4">
                <dt className="font-mono text-[0.875rem] text-ink">{f.name}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-ink-2">{f.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="check-title" className="border-t border-line py-14 lg:py-20">
        <Container>
          <h2 id="check-title" className="text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            Check one without Farbaek
          </h2>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
            With a signed ProofPack downloaded from Farbaek as proofpack.json, these steps need a shell, curl, jq and OpenSSL 3. The verify page does the same in your browser.
          </p>
          <ol className="mt-8 grid max-w-3xl gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid min-w-0 gap-3">
                <h3 className="flex items-baseline gap-3 text-[1.0625rem] font-medium">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-[0.8125rem] text-ink-2">{i + 1}</span>
                  {s.title}
                </h3>
                <CommandBlock label={s.label} command={s.command} />
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{s.after}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="proves-title" className="border-t border-line bg-surface py-14 lg:py-20">
        <Container>
          <h2 id="proves-title" className="text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            What a ProofPack proves
          </h2>
          <ul className="mt-8 grid gap-8 sm:grid-cols-3">
            {PROVES.map((p) => (
              <li key={p.title} className="grid content-start gap-3">
                <p.icon size={24} className="text-accent" aria-hidden />
                <h3 className="text-[1.0625rem] font-medium">{p.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{p.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
