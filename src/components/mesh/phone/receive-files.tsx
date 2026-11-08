"use client";

import { DownloadSimpleIcon, GlobeSimpleIcon, ShareNetworkIcon, TrashIcon, TrayArrowDownIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { TransferState } from "@/core/mesh/protocol";
import { WebMeshListener } from "@/core/mesh/web/listen";
import type { WebIncoming } from "@/core/mesh/web/receive";
import { WebRelay, WebRelayError } from "@/core/mesh/web/relay-pipe";
import { MEMORY_LIMIT, memorySink, opfsAvailable, opfsKept, opfsSink, type FileSink, type ReceivedMeta } from "@/core/mesh/web/sinks";
import { formatBytes } from "@/core/workspace/files";
import { listComputers, type BrowserDevice } from "./device-store";

// Each transfer state is one of the shared kinds (ADR 0183): its words, icon, colour and border together.
const STATE: Record<TransferState, { label: string; kind: Status }> = {
  packing: { label: "Checking", kind: "working" },
  connecting: { label: "Connecting", kind: "working" },
  waiting: { label: "Waiting", kind: "pending" },
  offered: { label: "Waiting for you", kind: "approval" },
  sending: { label: "Sending", kind: "working" },
  receiving: { label: "Receiving", kind: "working" },
  finishing: { label: "Checking", kind: "working" },
  done: { label: "Received and checked", kind: "verified" },
  declined: { label: "Declined", kind: "off" },
  cancelled: { label: "Cancelled", kind: "off" },
  interrupted: { label: "Stopped", kind: "paused" },
  failed: { label: "Stopped", kind: "failed" },
};

const REASONS: Record<string, string> = {
  secret_file: "Files with keys or passwords",
  secret_content: "Looks like it contains a secret",
  ignored_folder: "Dependency or build folders",
  invalid_path: "Names a computer can't hold safely",
  too_large: "Larger than 2 GB",
  link: "Links",
};

const grouped = (fp: string) => fp.match(/.{1,4}/g)?.join(" ") ?? fp;
const noSubscribe = () => () => undefined;
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const STORAGE_WORDS = {
  browser: "Kept in this browser until you clear them, even if you close the page.",
  memory: "This browser keeps them in this page only: save them before you close it.",
};

let seq = 0;
interface Entry {
  key: number;
  incoming: WebIncoming;
}
interface Kept {
  id: string;
  meta: ReceivedMeta;
  sink: FileSink;
}

/** Hands a file to the browser's own download, by its name without the folder. */
function download(file: File, path: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = baseName(path);
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function canShare(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/**
 * Receiving on this phone or browser (ADR 0097): while the switch is on and
 * this page is open, computers this device paired with can send it a
 * folder. The person sees what's offered and chooses; every piece is checked
 * against its hash before anything is kept, and nothing received is opened.
 */
export function ReceiveFiles({ device, stun, pairedCount }: { device: BrowserDevice; stun: string[]; pairedCount: number }) {
  const [listener, setListener] = useState<WebMeshListener | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kept, setKept] = useState<Kept[]>([]);
  const [switching, setSwitching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const ids = useId();

  useEffect(() => {
    let gone = false;
    void opfsKept()
      .then((list) => {
        if (!gone) setKept(list);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);

  // Leaving the page turns reachability off; the server forgets it on its own soon after too.
  useEffect(() => () => void listener?.setReachable(false), [listener]);

  const on = listener?.reachable === true;

  async function toggle() {
    setSwitching(true);
    setProblem(null);
    try {
      if (on) {
        await listener!.setReachable(false);
        return;
      }
      const l =
        listener ??
        new WebMeshListener({
          relay: new WebRelay({ base: `${location.origin}/api/v1/mesh/relay`, headers: { "x-farbaek-device": device.id } }),
          key: device.key,
          fingerprint: device.fingerprint,
          name: () => device.name,
          trusted: async () => (await listComputers()).map(({ name, fingerprint, publicKey }) => ({ name, fingerprint, publicKey })),
          iceServers: stun,
          onIncoming: (incoming) => setEntries((list) => [{ key: ++seq, incoming }, ...list.filter((e) => e.incoming.id !== incoming.id || e.incoming.state === "done")]),
          onUpdate: () => redraw((n) => n + 1),
        });
      setListener(l);
      await l.setReachable(true);
    } catch (error) {
      setProblem(error instanceof WebRelayError ? error.message : "Farbaek couldn't be reached. Check this device's internet connection, then try again.");
    } finally {
      setSwitching(false);
    }
  }

  const dismiss = (key: number) => setEntries((list) => list.filter((e) => e.key !== key));

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium text-ink">Receive files</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line px-3 py-2.5">
        <span className="grid min-w-0 gap-0.5">
          <span id={`${ids}-switch`} className="text-sm text-ink">
            Be reachable while this page is open
          </span>
          <span className={`flex items-start gap-1.5 text-xs font-medium ${on ? "text-verified" : "text-ink-3"}`}>
            <StatusGlyph status={on ? "verified" : "off"} size={14} className="mt-px" />
            <span>{on ? "Reachable: your paired computers can send here" : "Off: computers can't send here"}</span>
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${ids}-switch`}
          disabled={switching || (!on && pairedCount === 0)}
          onClick={() => void toggle()}
          className="relative inline-flex h-11 w-[4.25rem] shrink-0 items-center rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={`flex h-8 w-full items-center rounded-full border transition-colors duration-200 ${on ? "border-accent bg-accent" : "border-line-strong bg-surface-sunken"}`}>
            <span className={`size-6 rounded-full bg-surface shadow-e1 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "translate-x-[1.85rem]" : "translate-x-1"}`} />
          </span>
        </button>
      </div>
      <p className="text-xs text-ink-3">
        {pairedCount === 0 && !on ? "Pair with a computer first: only paired computers can send here. " : null}
        It stops when you close this page, or when the phone locks or sleeps. Only computers you paired with here can send, and you choose whether to accept. Turn it on, then choose Send over the internet in the Farbaek Agent.
      </p>
      {listener?.problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-ink">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden /> <span>{listener.problem}</span>
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> <span>{problem}</span>
        </p>
      ) : null}

      {entries.map(({ key, incoming }) => (
        <IncomingCard key={key} incoming={incoming} onDismiss={() => dismiss(key)} />
      ))}

      {kept.map((k) => (
        <div key={k.id} className="grid gap-2 rounded-md border border-line p-4">
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 text-ink">{`${k.meta.name} from ${k.meta.from}`}</span>
            <StatusBadge status="verified" label="Received and checked" />
          </p>
          <p className="text-xs text-ink-3">
            Received <LocalTime iso={k.meta.at} />. {STORAGE_WORDS.browser}
          </p>
          <SavedFiles sink={k.sink} onCleared={() => setKept((list) => list.filter((x) => x.id !== k.id))} />
        </div>
      ))}
    </div>
  );
}

function IncomingCard({ incoming, onDismiss }: { incoming: WebIncoming; onDismiss: () => void }) {
  const v = incoming.view();
  const st = STATE[v.state];
  // A browser fact: read after hydration, so the server's first render and the browser's agree.
  const memoryOnly = !useSyncExternalStore(noSubscribe, opfsAvailable, () => true);
  const tooBig = memoryOnly && v.bytes > MEMORY_LIMIT;
  const pct = v.bytes === 0 ? 100 : Math.min(100, Math.round((v.bytesDone / v.bytes) * 100));
  const byReason = new Map<string, string[]>();
  for (const e of v.excluded) byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.path]);

  return (
    <div className={`grid gap-2 rounded-md border p-4 ${v.state === "offered" ? "border-approval/30 bg-approval/[0.04]" : "border-line"}`} aria-live="polite">
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 text-ink">{`${v.name} from ${v.peer.name}`}</span>
        <StatusBadge status={st.kind} label={st.label} />
      </p>
      <p className="text-xs text-ink-3">{`${v.files.toLocaleString("en-US")} ${v.files === 1 ? "file" : "files"}, ${formatBytes(v.bytes)}`}</p>
      {v.peer.fingerprint ? (
        <details className="text-xs text-ink-3">
          <summary className="flex min-h-11 cursor-pointer items-center">Technical details</summary>
          <p>
            Their key fingerprint: <span className="break-all font-mono">{grouped(v.peer.fingerprint)}</span>
          </p>
        </details>
      ) : null}
      {v.excludedCount > 0 ? (
        <details className="text-xs text-ink-3">
          <summary className="flex min-h-11 cursor-pointer items-center">{`${v.excludedCount.toLocaleString("en-US")} ${v.excludedCount === 1 ? "item stays" : "items stay"} on ${v.peer.name}`}</summary>
          <ul className="grid gap-1.5 pb-1">
            {[...byReason].map(([reason, paths]) => (
              <li key={reason} className="grid gap-0.5">
                <span>{REASONS[reason] ?? "Left out"}</span>
                <span className="font-mono break-all">
                  {paths.slice(0, 6).join(", ")}
                  {paths.length > 6 ? ` and ${paths.length - 6} more` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {v.state === "receiving" || v.state === "finishing" ? (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Bytes received">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-ink-3">{`${formatBytes(v.bytesDone)} of ${formatBytes(v.bytes)}`}</p>
        </>
      ) : null}
      {v.state !== "offered" && v.state !== "declined" ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <GlobeSimpleIcon size={14} weight="bold" className="shrink-0" aria-hidden /> {v.via === "direct" ? "Directly over the internet, encrypted end to end" : "Through Farbaek, encrypted end to end"}
        </p>
      ) : null}
      {v.message ? <p className="text-sm text-ink-2">{v.message}</p> : null}

      {v.state === "offered" ? (
        <>
          <p className="text-xs text-ink-3">{tooBig ? `This browser can receive up to ${formatBytes(MEMORY_LIMIT)} at a time, so Accept is unavailable. Decline, then send fewer files at once or send them to a computer.` : memoryOnly ? STORAGE_WORDS.memory : STORAGE_WORDS.browser}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClasses("primary", "sm")} disabled={tooBig} title={tooBig ? "Too large for this browser to keep" : undefined} onClick={() => void incoming.accept(memoryOnly ? memorySink() : opfsSink(globalThis.crypto.randomUUID()))}>
              <TrayArrowDownIcon size={16} weight="bold" aria-hidden /> Accept
            </button>
            <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => void incoming.decline()}>
              Decline
            </button>
          </div>
        </>
      ) : null}
      {v.state === "receiving" || v.state === "finishing" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => void incoming.cancel()}>
            Cancel
          </button>
        </div>
      ) : null}
      {v.state === "done" && incoming.sink ? (
        <>
          <p className="text-xs text-ink-3">{incoming.sink.kind === "memory" ? STORAGE_WORDS.memory : STORAGE_WORDS.browser}</p>
          <SavedFiles sink={incoming.sink} onCleared={onDismiss} />
        </>
      ) : null}
      {v.state === "declined" || v.state === "cancelled" || v.state === "failed" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SavedFiles({ sink, onCleared }: { sink: FileSink; onCleared: () => void }) {
  const [files, setFiles] = useState<{ path: string; file: File }[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let gone = false;
    void sink
      .files()
      .then((list) => {
        if (!gone) setFiles(list);
      })
      .catch(() => {
        if (!gone) setFiles([]);
      });
    return () => {
      gone = true;
    };
  }, [sink]);

  async function saveAll() {
    if (!files) return;
    setSaving(true);
    for (const f of files) {
      download(f.file, f.path);
      // One at a time: browsers refuse a burst of downloads.
      await new Promise((r) => setTimeout(r, 400));
    }
    setSaving(false);
  }

  if (files === null) return <p className="text-xs text-ink-3">Listing the files…</p>;
  if (files.length === 0) return <p className="text-xs text-ink-3">These files are no longer in this browser.</p>;
  return (
    <div className="grid gap-2">
      <ul className="divide-y divide-line">
        {files.map((f) => (
          <li key={f.path} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="block font-mono text-xs break-all text-ink">{f.path}</span>
              <span className="block text-xs text-ink-3">{formatBytes(f.file.size)}</span>
            </span>
            <span className="flex gap-1">
              {canShare(f.file) ? (
                <button type="button" className={buttonClasses("ghost", "sm")} aria-label={`Share ${f.path}`} onClick={() => void navigator.share({ files: [f.file] }).catch(() => undefined)}>
                  <ShareNetworkIcon size={16} weight="bold" aria-hidden /> Share
                </button>
              ) : null}
              <button type="button" className={buttonClasses("secondary", "sm")} aria-label={`Save ${f.path}`} onClick={() => download(f.file, f.path)}>
                <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Save
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {files.length > 1 ? (
          <button type="button" className={buttonClasses("primary", "sm")} disabled={saving} onClick={() => void saveAll()}>
            <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> {saving ? "Saving…" : `Save all ${files.length}`}
          </button>
        ) : null}
        <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => void sink.clear().then(onCleared)}>
          <TrashIcon size={16} weight="bold" aria-hidden /> Clear from this browser
        </button>
      </div>
      {files.length > 1 ? <p className="text-xs text-ink-3">Saving puts each file in your downloads by its name, without its folder. Your browser may ask once to allow several downloads.</p> : null}
    </div>
  );
}
