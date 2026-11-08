import { DownloadSimpleIcon, KeyIcon, LockKeyIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { EvidenceCheck } from "@/components/verify/evidence-check";

export const metadata: Metadata = {
  title: "Check a proof",
  description: "Check a Farbaek ProofPack, receipt, security report or Workspace Capsule yourself. It's checked in your browser; nothing is uploaded.",
};

const MEANING = [
  {
    icon: SealCheckIcon,
    title: "Intact means unchanged",
    body: "Every record's digest is the SHA-256 of its canonical JSON. Change one character anywhere and the digest no longer matches.",
  },
  {
    icon: KeyIcon,
    title: "A signature shows who recorded it",
    body: "A signed ProofPack carries Farbaek's Ed25519 signature. This page checks it against the keys Farbaek publishes. When a record isn't signed, it says so: a match then proves it's unchanged, not who made it.",
  },
  {
    icon: LockKeyIcon,
    title: "It stays on your computer",
    body: "Files you choose are read and hashed in this tab with your browser's own cryptography. Nothing is sent to Farbaek or anyone else.",
  },
];

export default function VerifyPage() {
  return (
    <>
      <section className="pt-14 pb-10 sm:pt-20 lg:pt-24">
        <Container>
          <h1 className="max-w-[16ch] text-balance text-[2.5rem] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[3.5rem]">Check the proof yourself.</h1>
          <p className="mt-5 max-w-[56ch] text-[1.0625rem] leading-relaxed text-ink-2">
            Someone sent you a ProofPack, a receipt or a Capsule from Farbaek? Drop it here to see whether it&apos;s exactly what was recorded, and what it says was approved,
            changed and checked.
          </p>
          <a href="/verify/sample.json" download className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline">
            <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> No file yet? Try the sample ProofPack
          </a>
        </Container>
      </section>

      <section aria-label="Check a file" className="pb-16 lg:pb-24">
        <Container>
          <EvidenceCheck />
        </Container>
      </section>

      <section aria-labelledby="meaning-title" className="border-t border-line bg-surface py-16 lg:py-20">
        <Container>
          <h2 id="meaning-title" className="max-w-[24ch] text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            What a check here does, and doesn&apos;t, tell you.
          </h2>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3">
            {MEANING.map((m) => (
              <li key={m.title} className="grid content-start gap-3">
                <m.icon size={24} className="text-ink-2" aria-hidden />
                <h3 className="text-[1.0625rem] font-medium">{m.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{m.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-[70ch] text-sm leading-relaxed text-ink-3">
            Proof files come from Farbaek: download one from a ProofPack, or export a whole project with everything it holds. Each file uses an open format, so you can also
            check it without this page.{" "}
            <Link href="/proofpack/v1" className="font-medium text-accent underline-offset-2 hover:underline">
              The ProofPack format, and how to check one with OpenSSL
            </Link>
            .
          </p>
        </Container>
      </section>
    </>
  );
}
