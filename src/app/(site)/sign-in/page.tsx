import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect("/app");
  }

  return (
    <Container className="flex min-h-[70dvh] items-start justify-center py-16 sm:items-center">
      <div className="w-full max-w-[400px]">
        <p className="font-mono text-[13px] text-ink-3">{"// early access"}</p>
        <h1 className="mt-4 text-3xl font-medium tracking-[-0.02em]">Sign in to Farbaek</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          No password. We email you a one-time link. Farbaek is in early development, so expect rough edges.
        </p>
        <div className="mt-8">
          {supabase ? (
            <SignInForm linkError={error === "link"} />
          ) : (
            <p className="rounded-md border border-dashed border-line-strong/60 p-5 text-sm text-ink-2">
              Sign-in isn&apos;t connected in this environment. Add the Supabase URL and publishable key to <code>.env.local</code>.
            </p>
          )}
        </div>
      </div>
    </Container>
  );
}
