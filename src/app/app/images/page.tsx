import "@/styles/chat-theme.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { studioPageData } from "@/server/studio/page-data";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Image studio" };
export const dynamic = "force-dynamic";

/** Farbaek AI's image studio (stage 201, ADR 0216): the person's library and what they can make here. */
export default async function ImagesPage() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/images");
  if (!ctx.current) redirect("/app");
  const data = await studioPageData(ctx, "image");
  return <Studio kind="image" items={data.items} disabledReason={data.disabledReason} libraryUnread={data.libraryUnread} />;
}
