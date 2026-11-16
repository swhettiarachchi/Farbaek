import "@/styles/chat-theme.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { studioPageData } from "@/server/studio/page-data";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Video studio" };
export const dynamic = "force-dynamic";

/** Farbaek AI's video studio (stage 201, ADR 0216): the person's videos, their pictures to start from, and what they can make here. */
export default async function VideoPage({ searchParams }: { searchParams: Promise<{ still?: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/video");
  if (!ctx.current) redirect("/app");
  const [data, params] = await Promise.all([studioPageData(ctx, "video"), searchParams]);
  const still = typeof params.still === "string" && /^[0-9a-f-]{36}$/.test(params.still) ? params.still : null;
  return <Studio kind="video" items={data.items} pictures={data.pictures} disabledReason={data.disabledReason} initialStill={still} />;
}
