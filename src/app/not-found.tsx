import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <Container className="flex min-h-[60dvh] flex-col items-start justify-center py-20">
      <p className="font-mono text-[13px] text-ink-3">{"// 404"}</p>
      <h1 className="mt-4 text-4xl font-medium tracking-[-0.02em]">This page doesn&apos;t exist.</h1>
      <p className="mt-3 max-w-[48ch] text-lg text-ink-2">The link may be old, or the page may not have been built yet.</p>
      <ButtonLink href="/" className="mt-8">
        Back to home
      </ButtonLink>
    </Container>
  );
}
