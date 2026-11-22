import "@/styles/chat-theme.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";
import { savedTheme } from "@/server/theme";
import { getPlan } from "@/core/billing/catalog";
import { SAMPLE_CHATS } from "@/content/chat-samples";
import { loadChatAvailability } from "@/server/chat/setup";
import { listConversations } from "@/server/chat/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/**
 * Farbaek Chat's frame (stage 199, ADR 0213): the person's conversations in this workspace, what the AI can do for them here, and
 * their light or dark choice (every page's since stage 211, ADR 0227), for its settings to show.
 */
export default async function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.current) redirect("/app");
  const ws = ctx.current;
  const live = ctx.mode === "live";
  const client = live ? await createSupabaseServerClient().catch(() => null) : null;
  const [chats, projects, availability] = await Promise.all([
    client ? listConversations(client, ws.id, { archived: false, limit: 60 }).then((r) => r ?? []) : Promise.resolve(live ? [] : SAMPLE_CHATS),
    ctx.reader.listProjects(ws.id).catch(() => []),
    loadChatAvailability(ctx, ws, client),
  ]);
  const theme = await savedTheme();
  const trialDays = ws.trial?.phase.phase === "active" ? ws.trial.phase.daysRemaining : null;
  const planLabel = `${getPlan(ws.plan.planId).name}${ws.plan.source === "trial" ? " trial" : " plan"}${trialDays !== null ? `, ${trialDays} ${trialDays === 1 ? "day" : "days"} left` : ""}`;

  return (
    <ChatShell
      conversations={chats}
      projects={projects.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name }))}
      availability={{
        off: availability.off,
        imagesOff: availability.imagesOff,
        models: availability.models,
        percent: availability.percent,
        imagePercent: availability.imagePercent,
        resetsAt: availability.resetsAt,
        period: availability.period,
      }}
      theme={theme}
      demo={!live}
      user={{ email: ctx.user.email }}
      workspaceName={ws.name}
      planLabel={planLabel}
      signOut={live ? signOut : null}
    >
      {children}
    </ChatShell>
  );
}
