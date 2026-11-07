"use client";

import { ArrowUpRightIcon, CheckCircleIcon, CircleNotchIcon, DeviceMobileIcon, GlobeSimpleIcon, LinkSimpleIcon, PauseCircleIcon, ProhibitIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { TransferState } from "@/core/mesh/protocol";
import { WebDirectError, openDirectWeb } from "@/core/mesh/web/direct";
import { packPicked, WebPackError } from "@/core/mesh/web/pack";
import { WebPairing } from "@/core/mesh/web/pair";
import { WebRelay, WebRelayError } from "@/core/mesh/web/relay-pipe";
import { WebOutgoing, type WebOutgoingView } from "@/core/mesh/web/send";
import { initiateWeb, type WebSecureChannel } from "@/core/mesh/web/wire";
import { formatBytes } from "@/core/workspace/files";
import { forgetComputer, listComputers, loadDevice, renameDevice, saveComputer, type BrowserDevice, type StoredComputer } from "./device-store";
import { ReceiveFiles } from "./receive-files";

/** A computer of this workspace with Farbaek's relay on, and whether it's reachable this moment. */
export interface WorkspaceComputer {
  id: string;
  name: string;
  fingerprint: string;
  reachableNow: boolean;
}

const STATE: Record<TransferState, { label: string; icon: Icon | null; tone: string; spin?: boolean }> = {
  packing: { label: "Checking files", icon: CircleNotchIcon, tone: "text-ink-2", spin: true },
  connecting: { label: "Connecting", icon: CircleNotchIcon, tone: "text-ink-2", spin: true },
  waiting: { label: "Waiting for them", icon: null, tone: "text-approval" },
  offered: { label: "Waiting for you", icon: null, tone: "text-approval" },
  sending: { label: "Sending", icon: CircleNotchIcon, tone: "text-ink-2", spin: true },
  receiving: { label: "Receiving", icon: CircleNotchIcon, tone: "text-ink-2", spin: true },
  finishing: { label: "Checking", icon: CircleNotchIcon, tone: "text-ink-2", spin: true },
  done: { label: "Delivered", icon: CheckCircleIcon, tone: "text-verified" },
  declined: { label: "Declined", icon: ProhibitIcon, tone: "text-ink-3" },
  cancelled: { label: "Cancelled", icon: ProhibitIcon, tone: "text-ink-3" },
  interrupted: { label: "Stopped", icon: PauseCircleIcon, tone: "text-approval" },
  failed: { label: "Stopped", icon: XCircleIcon, tone: "text-failed" },
};

const grouped = (fp: string) => fp.match(/.{1,4}/g)?.join(" ") ?? fp;
const defaultName = () => (/iPhone|iPad|Android/i.test(navigator.userAgent) ? "Phone" : "Browser");

function Note({ tone = "text-ink-2", icon: NoteIcon = WarningCircleIcon, children }: { tone?: string; icon?: Icon; children: ReactNode }) {
  return (
    <p className={`flex items-start gap-2 text-sm ${tone}`}>
      <NoteIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

/**
 * This phone or browser in Mesh (ADR 0096): pair once with one of the
 * workspace's computers through Farbaek, comparing the same code on both
 * screens, then send it files, directly when the networks allow it, and
 * receive folders from it while this page is open (ADR 0097).
 */
export function PhoneMesh({ computers, unavailable }: { computers: WorkspaceComputer[]; unavailable: string | null }) {
  const [device, setDevice] = useState<BrowserDevice | null>(null);
  const [paired, setPaired] = useState<StoredComputer[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pairing, setPairing] = useState<WebPairing | null>(null);
  const [transfer, setTransfer] = useState<WebOutgoingView | null>(null);
  const [outgoing, setOutgoing] = useState<WebOutgoing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const [target, setTarget] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const ids = useId();

  useEffect(() => {
    if (unavailable) return;
    let gone = false;
    void (async () => {
      try {
        if (!globalThis.crypto?.subtle || typeof RTCPeerConnection === "undefined" || typeof indexedDB === "undefined") throw new Error("This browser can't do what's needed here. Try a current Chrome, Safari, Edge or Firefox.");
        const d = await loadDevice(defaultName());
        const list = await listComputers();
        if (!gone) {
          setDevice(d);
          setPaired(list);
        }
      } catch (error) {
        if (!gone) setProblem(error instanceof Error ? error.message : "This browser's storage isn't available.");
      }
    })();
    return () => {
      gone = true;
    };
  }, [unavailable]);

  if (unavailable) return <Note>{unavailable}</Note>;
  if (problem && !device) return <Note>{problem}</Note>;
  if (!device) return <Note tone="text-ink-3" icon={CircleNotchIcon}>Getting this browser ready…</Note>;

  const relay = new WebRelay({ base: `${location.origin}/api/v1/mesh/relay`, headers: { "x-farbaek-device": device.id } });
  const stun = [`stun:${location.hostname}:3478`];
  const hello = (purpose: "pair" | "transfer") => ({ v: 1 as const, name: device.name, purpose });
  const reachable = computers.filter((c) => c.reachableNow);
  const chosen = paired.find((c) => c.fingerprint === target) ?? paired[0] ?? null;

  async function pair(computer: WorkspaceComputer) {
    setBusy("pair");
    setProblem(null);
    try {
      const session = await relay.call(computer.fingerprint, device!.fingerprint, "pair");
      const channel = await initiateWeb(relay.open(session), device!.key, hello("pair"), 15_000);
      const p = await WebPairing.start(channel, () => redraw((n) => n + 1), async (c) => {
        await saveComputer(c);
        setPaired(await listComputers());
      });
      setPairing(p);
    } catch (error) {
      setProblem(error instanceof WebRelayError ? error.message : `${computer.name} didn't answer. On it, open Nearby, choose Pair a phone or browser, then try again within two minutes.`);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!chosen || files.length === 0) return;
    setBusy("send");
    setProblem(null);
    try {
      // The computer saves them in a folder named by the day, and says which device they came from.
      const packed = await packPicked(files, `Sent ${new Date().toISOString().slice(0, 10)}`);
      const connect = async (via: "relay" | "direct"): Promise<WebSecureChannel> => {
        const session = await relay.call(chosen.fingerprint, device!.fingerprint, via);
        const pipe = via === "direct" ? await openDirectWeb(relay.open(session), stun) : relay.open(session);
        return initiateWeb(pipe, device!.key, hello("transfer"), via === "direct" ? 15_000 : 30_000);
      };
      const t = new WebOutgoing(globalThis.crypto.randomUUID(), packed, chosen, "direct", connect, () => setTransfer(t.view()), (error) =>
        error instanceof WebDirectError
          ? { message: `Couldn't open a direct link to ${chosen.name}. ${error.message} Some networks block direct links, such as phone hotspots and many offices. You can send it through Farbaek's relay instead: still encrypted end to end, so the server can't read it.`, canUseRelay: true }
          : { message: error instanceof WebRelayError ? error.message : `Couldn't reach ${chosen.name}. Make sure it's open and reachable over the internet, then try again.`, canUseRelay: false },
      );
      setOutgoing(t);
      setTransfer(t.view());
      void t.start();
    } catch (error) {
      setProblem(error instanceof WebPackError ? error.message : "These files couldn't be read. Choose them again.");
    } finally {
      setBusy(null);
    }
  }

  const st = transfer ? STATE[transfer.state] : null;
  const pct = transfer ? (transfer.bytes === 0 ? 100 : Math.min(100, Math.round((transfer.bytesDone / transfer.bytes) * 100))) : 0;

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <label htmlFor={`${ids}-name`} className="text-sm font-medium text-ink">
          This device&apos;s name
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${ids}-name`}
            defaultValue={device.name}
            maxLength={60}
            onBlur={(e) => void renameDevice(device, e.target.value).then(setDevice)}
            className="h-11 min-w-0 flex-1 rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base"
          />
        </div>
        <p className="font-mono text-xs text-ink-3">{grouped(device.fingerprint)}</p>
      </div>

      {pairing ? (
        <div className="grid gap-3 rounded-md border border-accent/30 bg-accent/[0.04] p-4" aria-live="polite">
          <p className="text-sm font-medium text-ink">Pairing with {pairing.computer.name}</p>
          {pairing.active ? (
            <>
              <p className="text-sm text-ink-2">Check that {pairing.computer.name} shows exactly this code. If it does, confirm on both. If it doesn&apos;t, someone may be in between: don&apos;t pair.</p>
              <p className="font-mono text-3xl tracking-[0.2em] text-ink" aria-label={`Code ${pairing.code.split("").join(" ")}`}>
                {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
              </p>
            </>
          ) : null}
          {pairing.message ? <p className="text-sm text-ink-2">{pairing.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            {pairing.state === "confirming" ? (
              <>
                <button type="button" className={buttonClasses("primary", "sm")} onClick={() => void pairing.confirm(true).then(() => redraw((n) => n + 1))}>
                  Codes match
                </button>
                <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => void pairing.confirm(false).then(() => redraw((n) => n + 1))}>
                  They don&apos;t match
                </button>
              </>
            ) : null}
            {!pairing.active ? (
              <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setPairing(null)}>
                Done
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-sm font-medium text-ink">Pair with a computer</p>
        {reachable.length === 0 ? (
          <p className="text-sm text-ink-3">No computer of this workspace is reachable right now. In the Farbaek Agent on it, open Nearby and turn on Be reachable over the internet.</p>
        ) : (
          <ul className="grid gap-2">
            {reachable.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{c.name}</span>
                  <span className="block font-mono text-xs text-ink-3">{grouped(c.fingerprint)}</span>
                </span>
                {paired.some((p) => p.fingerprint === c.fingerprint) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-verified">
                    <CheckCircleIcon size={14} weight="fill" aria-hidden /> Paired
                  </span>
                ) : (
                  <button type="button" className={buttonClasses("secondary", "sm")} disabled={busy !== null || pairing?.active === true} onClick={() => void pair(c)}>
                    <LinkSimpleIcon size={16} aria-hidden /> Pair
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-3">First, on the computer, choose Pair a phone or browser in Nearby. Then pair here within two minutes.</p>
      </div>

      <div className="grid gap-3">
        <p className="text-sm font-medium text-ink">Send files</p>
        {paired.length === 0 ? (
          <p className="text-sm text-ink-3">Pair with a computer first.</p>
        ) : (
          <>
            <label htmlFor={`${ids}-to`} className="grid gap-1 text-sm">
              <span className="text-ink-2">To</span>
              <select id={`${ids}-to`} value={chosen?.fingerprint ?? ""} onChange={(e) => setTarget(e.target.value)} className="h-11 rounded-sm border border-line-strong/60 bg-surface px-3 text-base">
                {paired.map((c) => (
                  <option key={c.fingerprint} value={c.fingerprint}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${ids}-files`} className="grid gap-1 text-sm">
              <span className="text-ink-2">Files</span>
              <input id={`${ids}-files`} type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-base file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line file:bg-surface-raised file:px-4 file:text-sm" />
            </label>
            {files.length > 0 ? <p className="text-xs text-ink-3">{`${files.length} ${files.length === 1 ? "file" : "files"}, ${formatBytes(files.reduce((n, f) => n + f.size, 0))}. Credentials files and secret-looking text stay on this device.`}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClasses("primary", "sm")} disabled={busy !== null || files.length === 0 || !chosen || (transfer !== null && !["done", "failed", "declined", "cancelled", "interrupted"].includes(transfer.state))} onClick={() => void send()}>
                <ArrowUpRightIcon size={16} aria-hidden /> {busy === "send" ? "Checking files…" : "Send over the internet"}
              </button>
            </div>
            <p className="text-xs text-ink-3">The computer must be open and reachable. The files go directly when both networks allow it, encrypted end to end, and the computer checks every piece.</p>
          </>
        )}
      </div>

      {transfer && st ? (
        <div className="grid gap-2 rounded-md border border-line p-4" aria-live="polite">
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink">{`${transfer.name} to ${transfer.device.name}`}</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${st.tone}`}>
              {st.icon ? <st.icon size={14} weight="bold" className={st.spin ? "motion-safe:animate-spin" : ""} aria-hidden /> : null} {st.label}
            </span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Bytes sent">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-ink-3">{`${formatBytes(transfer.bytesDone)} of ${formatBytes(transfer.bytes)}, ${transfer.files} ${transfer.files === 1 ? "file" : "files"}`}</p>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <GlobeSimpleIcon size={14} aria-hidden /> {transfer.via === "direct" ? "Directly over the internet, encrypted end to end" : "Through Farbaek, encrypted end to end"}
          </p>
          {transfer.message ? <p className="text-sm text-ink-2">{transfer.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            {transfer.canUseRelay ? (
              <button type="button" className={buttonClasses("primary", "sm")} onClick={() => void outgoing?.useRelay()}>
                <GlobeSimpleIcon size={16} aria-hidden /> Send through Farbaek instead
              </button>
            ) : null}
            {transfer.state === "interrupted" ? (
              <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => void outgoing?.start()}>
                {transfer.canUseRelay ? "Try directly again" : "Resume"}
              </button>
            ) : null}
            {["connecting", "waiting", "sending", "finishing"].includes(transfer.state) ? (
              <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => void outgoing?.cancel()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {problem ? <Note tone="text-failed">{problem}</Note> : null}

      <ReceiveFiles device={device} stun={stun} pairedCount={paired.length} />

      {paired.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-ink">Paired with this device</p>
          <ul className="divide-y divide-line">
            {paired.map((c) => (
              <li key={c.fingerprint} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                  <DeviceMobileIcon size={16} className="text-ink-3" aria-hidden /> {c.name} <span className="font-mono text-xs text-ink-3">{grouped(c.fingerprint)}</span>
                </span>
                <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => void forgetComputer(c.fingerprint).then(listComputers).then(setPaired)}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
