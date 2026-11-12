"use client";

import { ArrowRightIcon, ArrowsClockwiseIcon, CheckCircleIcon, DeviceMobileIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { DeviceCopyPayloadSchema, copyVersion, type DeviceCopyManifest } from "@/core/workspace/device-copy";
import { askToPersist, deviceStorageSupport, keepProject, keptProject, readSaves, removeKept, storagePersisted } from "./device-store";

type Snapshot = { kind: "checking" } | { kind: "unsupported"; reason: string } | { kind: "ready"; manifest: DeviceCopyManifest | null; current: boolean; waiting: number; persisted: boolean | null };

async function snapshot(userId: string, projectId: string, version: string): Promise<Snapshot> {
  const support = deviceStorageSupport();
  if (!support.ok) return { kind: "unsupported", reason: support.reason };
  const [manifest, saves, persisted] = await Promise.all([keptProject(userId, projectId), readSaves(userId), storagePersisted()]);
  return {
    kind: "ready",
    manifest,
    current: manifest ? (await copyVersion(manifest.files)) === version : false,
    waiting: saves.filter((s) => s.projectId === projectId).length,
    persisted,
  };
}

/**
 * "Keep on this device" on a project's Files card (ADR 0192): a copy in
 * this browser's own storage, for this account only, to open and edit
 * without a connection on the device page.
 */
export function KeepOnDevice({ projectId, userId, version }: { projectId: string; userId: string; version: string }) {
  const [state, setState] = useState<Snapshot>({ kind: "checking" });
  const [busy, setBusy] = useState<"keeping" | "removing" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [note, setNote] = useState<{ tone: "done" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    snapshot(userId, projectId, version).then(
      (s) => alive && setState(s),
      () => alive && setState({ kind: "unsupported", reason: "This browser's storage couldn't be opened." }),
    );
    return () => {
      alive = false;
    };
  }, [userId, projectId, version]);

  async function keep() {
    setBusy("keeping");
    setNote(null);
    try {
      const res = await fetch(`/app/projects/${projectId}/device/copy`, { cache: "no-store", credentials: "same-origin" });
      const body = (await res.json().catch(() => null)) as { data?: unknown; message?: unknown } | null;
      if (!res.ok) throw new Error(typeof body?.message === "string" ? body.message : "Farbaek couldn't send the project just now. Try again.");
      const copy = DeviceCopyPayloadSchema.safeParse(body?.data);
      if (!copy.success || copy.data.userId !== userId || copy.data.projectId !== projectId) throw new Error("Farbaek's answer couldn't be read. Reload the page and try again.");
      await keepProject(copy.data, new Date());
      // The card's own line says when the browser may still clear it.
      await askToPersist();
      setState(await snapshot(userId, projectId, version));
      setNote({ tone: "done", text: "Kept on this device." });
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error && e.message ? e.message : "The copy couldn't be kept. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("removing");
    setNote(null);
    try {
      await removeKept(userId, projectId);
      setConfirmRemove(false);
      setState(await snapshot(userId, projectId, version));
      setNote({ tone: "done", text: "Removed from this device." });
    } catch {
      setNote({ tone: "error", text: "The copy couldn't be removed. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const kept = state.kind === "ready" ? state.manifest : null;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <DeviceMobileIcon size={16} weight="bold" className="text-ink-3" aria-hidden /> On this device
      </h3>

      {state.kind === "checking" ? <p className="mt-2 h-5 w-48 rounded-full bg-surface-sunken motion-safe:animate-pulse" aria-hidden /> : null}

      {state.kind === "unsupported" ? (
        <>
          <p className="mt-2 text-sm text-ink-2">{state.reason}</p>
          <div className="mt-3">
            <button type="button" disabled aria-disabled className={buttonClasses("secondary", "sm")}>
              <DeviceMobileIcon size={16} weight="bold" aria-hidden /> Keep on this device
            </button>
          </div>
        </>
      ) : null}

      {state.kind === "ready" ? (
        <>
          <p className="mt-2 text-sm text-ink-2">
            {kept ? (
              <>
                Kept here <RelativeTime iso={kept.keptAt} />, <span className="tabular">{kept.files.length.toLocaleString("en-US")}</span> {kept.files.length === 1 ? "file" : "files"}.{" "}
                {state.current ? "It matches Farbaek." : "Farbaek has newer files. Update the copy to bring them here."}
              </>
            ) : (
              "Keep a copy here to open and edit this project without a connection. Changes saved offline go to Farbaek when you send them."
            )}
          </p>
          {state.waiting > 0 ? (
            <p className="mt-1 text-sm text-ink-2">
              <span className="tabular font-medium text-ink">{state.waiting}</span> {state.waiting === 1 ? "change saved here is" : "changes saved here are"} waiting to be sent.
            </p>
          ) : null}
          {kept && state.persisted === false ? <p className="mt-1 text-xs text-ink-3">This browser may clear the copy if the device runs short of space.</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {kept ? (
              <>
                <Link prefetch={false} href={`/device?project=${projectId}`} className={buttonClasses("secondary", "sm")}>
                  Open on this device <ArrowRightIcon size={16} weight="bold" aria-hidden />
                </Link>
                {!state.current ? (
                  <button type="button" onClick={keep} disabled={busy !== null} className={buttonClasses("secondary", "sm")}>
                    <ArrowsClockwiseIcon size={16} weight="bold" aria-hidden /> {busy === "keeping" ? "Updating…" : "Update the copy"}
                  </button>
                ) : null}
                {confirmRemove ? null : (
                  <button type="button" onClick={() => (state.waiting > 0 ? setConfirmRemove(true) : remove())} disabled={busy !== null} className={buttonClasses("ghost", "sm")}>
                    <TrashIcon size={16} weight="bold" aria-hidden /> {busy === "removing" ? "Removing…" : "Remove from this device"}
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={keep} disabled={busy !== null} className={buttonClasses("secondary", "sm")}>
                <DeviceMobileIcon size={16} weight="bold" aria-hidden /> {busy === "keeping" ? "Keeping…" : "Keep on this device"}
              </button>
            )}
          </div>

          {confirmRemove ? (
            <div role="group" aria-label="Remove the copy" className="mt-3 grid gap-3 rounded-sm border border-line bg-surface-raised/70 p-4">
              <p className="text-sm">
                {state.waiting === 1 ? "One change saved here hasn't been sent." : `${state.waiting} changes saved here haven't been sent.`} Removing the copy removes{" "}
                {state.waiting === 1 ? "it" : "them"} too.
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={remove} disabled={busy !== null} className={buttonClasses("danger", "sm")}>
                  {busy === "removing" ? "Removing…" : "Remove anyway"}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy !== null} className={buttonClasses("ghost", "sm")}>
                  Keep it
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <p aria-live="polite" className="empty:hidden">
        {note ? (
          <span className={`mt-3 flex items-start gap-2 text-sm ${note.tone === "error" ? "text-failed" : "text-ink-2"}`}>
            {note.tone === "error" ? (
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            ) : (
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            )}
            {note.text}
          </span>
        ) : null}
      </p>
    </div>
  );
}
