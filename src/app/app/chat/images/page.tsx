import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImageGallery } from "@/components/chat/image-gallery";
import { listGeneratedImages } from "@/server/chat/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Images" };

/** Every image the AI made for this person in this workspace, newest first (stage 199). */
export default async function ChatImagesPage() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.current) redirect("/app");
  const client = ctx.mode === "live" ? await createSupabaseServerClient().catch(() => null) : null;
  const images = client ? ((await listGeneratedImages(client, ctx.current.id, 60)) ?? []) : [];
  return <ImageGallery images={images} demo={ctx.mode !== "live"} />;
}
