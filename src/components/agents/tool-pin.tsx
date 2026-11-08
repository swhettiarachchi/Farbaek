"use client";

import { CheckCircleIcon, LockSimpleIcon, WarningIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { approveAgentToolsAction } from "@/app/app/agents/tool-actions";
import { parseMcpToolName } from "@/agent-runtime/mcp/names";
import { buttonClasses } from "@/components/ui/button";
import type { ToolPinView } from "@/core/agent/tool-pins";

/**
 * An agent's pinned tools (ADR 0133): how many, and, when they changed,
 * exactly what changed, with Approve for owners and admins. Until then the
 * agent's model steps are refused.
 */
export function ToolPinPanel({ agentId, pin, canApprove, disabledReason }: { agentId: string; pin: ToolPinView | null; canApprove: boolean; disabledReason: string | null }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!pin) return <p className="text-sm text-ink-3">Its tools are pinned the first time it asks the AI for a step.</p>;
  if (pin.status === "pinned") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <LockSimpleIcon size={16} className="text-verified" aria-hidden /> {pin.tools === 1 ? "1 tool" : `${pin.tools} tools`} pinned. A change pauses its AI steps until someone approves it.
      </p>
    );
  }
  const d = pin.diff;
  return (
    <div className="grid gap-3 rounded-md border border-approval/50 bg-approval/[0.06] p-4">
      <p className="text-sm font-medium text-ink">Its tools changed, so its AI steps are paused until they&apos;re reviewed.</p>
      {d ? (
        <ul className="grid gap-2 text-sm text-ink-2">
          {d.added.map((n) => {
            const mcp = parseMcpToolName(n);
            return (
              <li key={`a-${n}`}>
                Added <span className="font-mono text-ink">{n}</span>
                {/* A tool from an MCP server the agent's person added on that computer (ADR 0148), said in words. */}
                {mcp ? <>: a tool from &ldquo;{mcp.server}&rdquo;, a tool server added on that computer. Each call still waits for the person there to approve it.</> : null}
              </li>
            );
          })}
          {d.removed.map((n) => (
            <li key={`r-${n}`}>
              Removed <span className="font-mono text-ink">{n}</span>
            </li>
          ))}
          {d.changed.map((c) => (
            <li key={`c-${c.name}`} className="grid gap-1">
              <span>
                Changed <span className="font-mono text-ink">{c.name}</span>
                {c.schemaChanged ? ": its inputs changed" : ""}
              </span>
              {c.description ? (
                <span className="grid gap-1 rounded-sm border border-line bg-surface p-2 text-xs">
                  <span className="text-ink-3">Before: {c.description.from}</span>
                  <span className="text-ink">After: {c.description.to}</span>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canApprove ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || Boolean(disabledReason) || !pin.pendingId}
            onClick={() =>
              start(async () => {
                const r = await approveAgentToolsAction({ agentId, manifestId: pin.pendingId! });
                setMessage(r.status === "done" ? { ok: true, text: "Approved. Its AI steps work again." } : r.status === "error" ? { ok: false, text: r.message } : null);
              })
            }
            className={buttonClasses("secondary", "sm")}
          >
            {pending ? "Approving…" : "Approve these tools"}
          </button>
          {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : <span className="text-xs text-ink-3">If you didn&apos;t expect this, revoke the agent instead.</span>}
        </div>
      ) : (
        <p className="text-sm text-ink-3">An owner or admin reviews the change.</p>
      )}
      <div aria-live="polite" className="empty:hidden">
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={`flex items-start gap-2 text-sm ${message.ok ? "text-ink-2" : "text-failed"}`}>
            {message.ok ? <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden /> : <WarningIcon size={16} className="mt-0.5 shrink-0" aria-hidden />}
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
