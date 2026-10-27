import {
  ArrowCounterClockwiseIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BroadcastIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  FolderOpenIcon,
  GlobeSimpleIcon,
  HourglassMediumIcon,
  LinkSimpleIcon,
  MagnifyingGlassIcon,
  PauseCircleIcon,
  ProhibitIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { TransferState } from "@/core/mesh/protocol";
import { formatBytes } from "@/core/workspace/files";
import type { MeshSnapshot, MeshState, PreparedView, Result } from "../shared/api";

const mesh = window.farbaek.mesh;

const STATE: Record<TransferState, { label: string; icon: Icon; tone: string; spin?: boolean }> = {
  packing: { label: "Packing", icon: CircleNotchIcon, tone: "info", spin: true },
  connecting: { label: "Connecting", icon: CircleNotchIcon, tone: "info", spin: true },
  waiting: { label: "Waiting for them", icon: HourglassMediumIcon, tone: "approval" },
  offered: { label: "Waiting for you", icon: HourglassMediumIcon, tone: "approval" },
  sending: { label: "Sending", icon: CircleNotchIcon, tone: "info", spin: true },
  receiving: { label: "Receiving", icon: CircleNotchIcon, tone: "info", spin: true },
  finishing: { label: "Checking", icon: CircleNotchIcon, tone: "info", spin: true },
  done: { label: "Checked", icon: CheckCircleIcon, tone: "verified" },
  declined: { label: "Declined", icon: ProhibitIcon, tone: "neutral" },
  cancelled: { label: "Cancelled", icon: ProhibitIcon, tone: "neutral" },
  interrupted: { label: "Interrupted", icon: PauseCircleIcon, tone: "approval" },
  failed: { label: "Stopped", icon: XCircleIcon, tone: "failed" },
};

const ACTIVE: ReadonlySet<TransferState> = new Set(["connecting", "waiting", "sending", "receiving", "finishing"]);
const FINAL: ReadonlySet<TransferState> = new Set(["done", "declined", "cancelled", "failed"]);

const REASONS: Record<string, string> = {
  secret_file: "Credentials files",
  secret_content: "Looks like it contains a secret",
  ignored_folder: "Dependency or build folders",
  invalid_path: "Names this computer can't hold safely",
  too_large: "Larger than 2 GB",
  link: "Links",
};

/** "a1b2c3d4e5f6a7b8" as "a1b2 c3d4 e5f6 a7b8", easier to compare aloud. */
const grouped = (fp: string) => fp.match(/.{1,4}/g)?.join(" ") ?? fp;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function left(until: string, now: number): string {
  const s = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Badge({ tone, icon: BadgeIcon, children, spin = false }: { tone: string; icon: Icon; children: ReactNode; spin?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      <BadgeIcon size={14} weight="bold" className={spin ? "spin" : ""} aria-hidden /> {children}
    </span>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="alert">
      <XCircleIcon size={18} weight="bold" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Excluded({ items, count }: { items: { path: string; reason: string }[]; count: number }) {
  if (count === 0) return <p className="small muted">Nothing was left out.</p>;
  const byReason = new Map<string, string[]>();
  for (const e of items) byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.path]);
  return (
    <details className="excluded">
      <summary>
        {count.toLocaleString("en-US")} {count === 1 ? "item stays" : "items stay"} on this computer
      </summary>
      <ul>
        {[...byReason].map(([reason, paths]) => (
          <li key={reason}>
            <span className="small">{REASONS[reason] ?? "Left out"}</span>
            <span className="mono small muted break">{paths.slice(0, 6).join(", ")}{paths.length > 6 ? ` and ${paths.length - 6} more` : ""}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Nearby: folders straight to another computer on the same network (Mesh
 * phase B). The main process does all the work; this page shows its
 * snapshots and asks for actions.
 */
export function NearbyView({ intro }: { intro?: ReactNode }) {
  const [state, setState] = useState<MeshState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void mesh.state().then(setState);
    return mesh.onUpdate((snapshot) => setState({ available: true, snapshot }));
  }, []);

  async function act<T>(label: string, run: () => Promise<Result<T>>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    const r = await run();
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return undefined;
    }
    void mesh.state().then(setState);
    return r.value;
  }

  if (!state) return <p className="muted">Loading…</p>;

  return (
    <section className="stack">
      <header className="view-head">
        <h1>Nearby</h1>
        <p className="muted">
          Send a folder straight to another computer on your network. It goes directly between the two, encrypted, and every piece is checked against its hash when it
          arrives. Over the internet it goes directly between your computers too when the networks allow it, and through Farbaek&apos;s relay only if you choose it: encrypted end to end either way.
        </p>
        {intro}
      </header>
      {!state.available ? (
        <Alert>{state.reason}</Alert>
      ) : (
        <Nearby snapshot={state.snapshot} busy={busy} act={act} />
      )}
      {error ? <Alert>{error}</Alert> : null}
    </section>
  );
}

type Act = <T>(label: string, run: () => Promise<Result<T>>) => Promise<T | undefined>;

function Nearby({ snapshot: s, busy, act }: { snapshot: MeshSnapshot; busy: string | null; act: Act }) {
  const now = useNow(Boolean(s.visible || s.pairing || (s.relay.available && s.relay.pairingUntil)));
  const incoming = s.transfers.filter((t) => t.direction === "in" && t.state === "offered");
  const others = s.transfers.filter((t) => !(t.direction === "in" && t.state === "offered"));

  return (
    <>
      {incoming.map((t) => (
        <div key={t.id} className="card stack-sm offer" aria-live="polite">
          <div className="row">
            <h2>
              {t.peer.name} wants to send {t.name}
            </h2>
            <Badge tone="approval" icon={HourglassMediumIcon}>
              Waiting for you
            </Badge>
          </div>
          <p className="muted">
            {t.files.toLocaleString("en-US")} {t.files === 1 ? "file" : "files"}, {formatBytes(t.bytes)}. It&apos;s saved into a new folder in the place you choose, and nothing
            in it runs.
          </p>
          <Excluded items={t.excluded} count={t.excludedCount} />
          <div className="row-start">
            <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("accept", () => mesh.accept(t.id))}>
              <FolderOpenIcon size={16} aria-hidden /> Accept and choose folder
            </button>
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("decline", () => mesh.decline(t.id))}>
              Decline
            </button>
          </div>
        </div>
      ))}

      {s.pairing ? <PairingCard pairing={s.pairing} now={now} act={act} busy={busy} /> : null}

      <div className="card stack-sm">
        <div className="row">
          <div>
            <h2>This computer</h2>
            <p className="small muted">
              {s.self.name} · <span className="mono">{grouped(s.self.fingerprint)}</span>
            </p>
          </div>
          {s.visible ? (
            <Badge tone="verified" icon={BroadcastIcon}>
              Visible · {left(s.visible.until, now)} left
            </Badge>
          ) : (
            <Badge tone="neutral" icon={ShieldCheckIcon}>
              Not visible
            </Badge>
          )}
        </div>
        {s.visible ? (
          <>
            <p className="muted">
              Other computers on this network can find this one, pair with it and offer it folders. Each pairing needs the same code on both screens, and each folder needs you
              to accept it.
            </p>
            {s.visible.addresses.length > 0 ? (
              <p className="small">
                To connect by address: <span className="mono">{s.visible.addresses.join(", ")}</span>, port <span className="mono">{s.visible.port}</span>
              </p>
            ) : null}
            <div className="row-start">
              <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("visible", () => mesh.setVisible(false))}>
                Stop being visible
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">To receive a folder or be paired, make this computer visible. It stops after five minutes. Windows may ask to allow Farbaek Agent on private networks.</p>
            <div className="row-start">
              <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("visible", () => mesh.setVisible(true))}>
                <BroadcastIcon size={16} aria-hidden /> Be visible for 5 minutes
              </button>
            </div>
          </>
        )}
      </div>

      <RelayCard snapshot={s} now={now} busy={busy} act={act} />

      <SendCard snapshot={s} busy={busy} act={act} />

      {others.length > 0 ? (
        <div className="card stack-sm">
          <h2>Transfers</h2>
          <ul className="transfers">
            {others.map((t) => (
              <TransferRow key={t.id} transfer={t} busy={busy} act={act} />
            ))}
          </ul>
        </div>
      ) : null}

      <ComputersCard snapshot={s} busy={busy} act={act} />
    </>
  );
}

function PairingCard({ pairing: p, now, act, busy }: { pairing: NonNullable<MeshSnapshot["pairing"]>; now: number; act: Act; busy: string | null }) {
  const final = p.state !== "confirming" && p.state !== "waiting";
  return (
    <div className="card stack-sm pairing" aria-live="polite">
      <div className="row">
        <h2>Pairing with {p.peer.name}</h2>
        {p.state === "paired" ? (
          <Badge tone="verified" icon={CheckCircleIcon}>
            Paired
          </Badge>
        ) : final ? (
          <Badge tone="failed" icon={XCircleIcon}>
            Not paired
          </Badge>
        ) : (
          <Badge tone="approval" icon={HourglassMediumIcon}>
            {left(p.expiresAt, now)} left
          </Badge>
        )}
      </div>
      {!final ? (
        <>
          <p className="muted">Check that {p.peer.name} shows exactly this code. If it does, confirm on both computers. If it doesn&apos;t, someone may be in between: don&apos;t pair.</p>
          <p className="pair-code mono" aria-label={`Code ${p.code.split("").join(" ")}`}>
            {p.code.slice(0, 3)} {p.code.slice(3)}
          </p>
          <p className="small muted">
            Their key: <span className="mono">{grouped(p.peer.fingerprint)}</span>
          </p>
        </>
      ) : null}
      {p.message ? <p className="small">{p.message}</p> : null}
      <div className="row-start">
        {p.state === "confirming" ? (
          <>
            <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("confirm", () => mesh.confirm(true))}>
              Codes match
            </button>
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("confirm", () => mesh.confirm(false))}>
              They don&apos;t match
            </button>
          </>
        ) : null}
        {final || p.state === "waiting" ? (
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void act("dismiss", () => mesh.dismissPairing())}>
            {final ? "Done" : "Cancel pairing"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Paired computers on different networks (ADR 0094, ADR 0095): directly when
 * the networks allow it, through Farbaek's relay when the person chooses it.
 * Turning it on is the consent: this computer answers only devices it paired
 * with nearby, while the app is open, and Farbaek can't read what it carries.
 */
function RelayCard({ snapshot: s, now, busy, act }: { snapshot: MeshSnapshot; now: number; busy: string | null; act: Act }) {
  const r = s.relay;
  return (
    <div className="card stack-sm">
      <div className="row">
        <h2>Over the internet</h2>
        {r.available && r.reachable ? (
          <Badge tone="verified" icon={GlobeSimpleIcon}>
            Reachable
          </Badge>
        ) : (
          <Badge tone="neutral" icon={ShieldCheckIcon}>
            Not reachable
          </Badge>
        )}
      </div>
      <p className="muted">
        For your paired computers on other networks, while both apps are open. Farbaek helps the two find each other, then the files go directly between them when both networks
        allow it. If a direct link is blocked, you can choose to send through Farbaek&apos;s relay instead, which can&apos;t read them either and keeps nothing. Everything is
        encrypted end to end, and only devices you paired are answered: computers on the same network, and phones or browsers while you open a pairing window here.
      </p>
      {!r.available ? (
        <p className="small">{r.reason}</p>
      ) : (
        <>
          {r.problem ? <p className="small">{r.problem}</p> : null}
          <div className="row-start">
            {r.reachable ? (
              <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("reachable", () => mesh.setReachable(false))}>
                Stop being reachable
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("reachable", () => mesh.setReachable(true))}>
                <GlobeSimpleIcon size={16} aria-hidden /> Be reachable over the internet
              </button>
            )}
          </div>
          <p className="small muted">It stays on while this app is open. Each folder still needs you to accept it.</p>
          {r.reachable ? (
            r.pairingUntil && Date.parse(r.pairingUntil) > now ? (
              <div className="stack-sm">
                <p className="small">
                  Open for a phone or browser for {left(r.pairingUntil, now)}. On it, open Farbaek&apos;s Mesh page, sign in, and choose this computer. The same code shows on both screens when it calls.
                </p>
                <div className="row-start">
                  <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("pair-remote", () => mesh.pairRemote(false))}>
                    Stop waiting
                  </button>
                </div>
              </div>
            ) : (
              <div className="row-start">
                <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("pair-remote", () => mesh.pairRemote(true))}>
                  <LinkSimpleIcon size={16} aria-hidden /> Pair a phone or browser
                </button>
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}

function SendCard({ snapshot: s, busy, act }: { snapshot: MeshSnapshot; busy: string | null; act: Act }) {
  const prepared: PreparedView | undefined = s.prepared[0];
  const [target, setTarget] = useState("");
  const nearbyPaired = new Set(s.nearby.filter((n) => n.paired).map((n) => n.fingerprint));
  const chosen = target || s.devices.find((d) => nearbyPaired.has(d.fingerprint))?.fingerprint || s.devices[0]?.fingerprint || "";
  const toPhone = s.devices.find((d) => d.fingerprint === chosen)?.via === "farbaek";

  return (
    <div className="card stack-sm">
      <h2>Send a folder</h2>
      {!prepared ? (
        <>
          <p className="muted">Choose a folder. Its files are checked and hashed here first; credentials, keys, .env files and dependency folders stay on this computer.</p>
          <div className="row-start">
            <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("prepare", () => mesh.prepare())}>
              {busy === "prepare" ? <CircleNotchIcon size={16} className="spin" aria-hidden /> : <FolderOpenIcon size={16} aria-hidden />}
              {busy === "prepare" ? "Checking files…" : "Choose a folder"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            <strong>{prepared.name}</strong>: {prepared.files.toLocaleString("en-US")} {prepared.files === 1 ? "file" : "files"}, {formatBytes(prepared.bytes)}.
          </p>
          <p className="small mono muted break">{prepared.root}</p>
          <Excluded items={prepared.excluded} count={prepared.excludedCount} />
          <p className="small muted">Secret detection is pattern-based and not guaranteed. Look over what you send.</p>
          {s.devices.length === 0 ? (
            <p className="muted">Pair with the other computer first, below.</p>
          ) : (
            <label className="field">
              <span>Send to</span>
              <select value={chosen} onChange={(e) => setTarget(e.target.value)}>
                {s.devices.map((d) => (
                  <option key={d.fingerprint} value={d.fingerprint}>
                    {d.name}
                    {d.via === "farbaek" ? " (phone or browser)" : nearbyPaired.has(d.fingerprint) ? " (visible now)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row-start">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy !== null || !chosen || toPhone}
              title={toPhone ? "Phones and browsers receive over the internet." : undefined}
              onClick={() => void act("send", () => mesh.send({ preparedId: prepared.id, fingerprint: chosen }))}
            >
              <ArrowUpRightIcon size={16} aria-hidden /> Send
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={busy !== null || !chosen || !s.relay.available}
              onClick={() => void act("send", () => mesh.sendOverInternet({ preparedId: prepared.id, fingerprint: chosen }))}
            >
              <GlobeSimpleIcon size={16} aria-hidden /> Send over the internet
            </button>
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("drop", () => mesh.dropPrepared(prepared.id))}>
              Choose another folder
            </button>
          </div>
          <p className="small muted">
            {toPhone
              ? "Send is unavailable: phones and browsers receive over the internet. On the phone, open Mesh in Farbaek and turn on Be reachable, then choose Send over the internet."
              : s.relay.available
                ? "Send goes over this network. Send over the internet reaches the other computer anywhere, if it's open and reachable: directly when both networks allow it."
                : `Send over the internet is unavailable: ${s.relay.reason}`}
          </p>
          {toPhone && !s.relay.available ? <p className="small muted">Send over the internet is unavailable: {s.relay.reason}</p> : null}
        </>
      )}
    </div>
  );
}

function TransferRow({ transfer: t, busy, act }: { transfer: MeshSnapshot["transfers"][number]; busy: string | null; act: Act }) {
  const st = STATE[t.state];
  const pct = t.bytes === 0 ? (t.state === "done" ? 100 : 0) : Math.min(100, Math.round((t.bytesDone / t.bytes) * 100));
  const DirIcon = t.direction === "out" ? ArrowUpRightIcon : ArrowDownLeftIcon;
  return (
    <li className="transfer">
      <div className="row">
        <p className="transfer-title">
          <DirIcon size={16} weight="bold" aria-hidden />
          <span>
            {t.direction === "out" ? `${t.name} to ${t.peer.name}` : `${t.name} from ${t.peer.name}`}
          </span>
        </p>
        <Badge tone={st.tone} icon={st.icon} spin={st.spin}>
          {st.label}
        </Badge>
      </div>
      {!FINAL.has(t.state) || t.state === "done" ? (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Bytes transferred">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="small muted">
        {formatBytes(t.bytesDone)} of {formatBytes(t.bytes)} · {t.files.toLocaleString("en-US")} {t.files === 1 ? "file" : "files"}
      </p>
      {t.via !== "nearby" ? (
        <p className="small muted">
          <GlobeSimpleIcon size={14} aria-hidden /> {t.via === "direct" ? "Directly over the internet, encrypted end to end" : "Through Farbaek, encrypted end to end"}
        </p>
      ) : null}
      {t.message ? <p className="small">{t.message}</p> : null}
      <div className="row-start">
        {t.direction === "in" && t.state === "done" ? (
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void act("open", () => mesh.openFolder(t.id))}>
            <FolderOpenIcon size={16} aria-hidden /> Open folder
          </button>
        ) : null}
        {t.direction === "out" && t.state === "interrupted" && t.canUseRelay ? (
          <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("relay", () => mesh.useRelay(t.id))}>
            <GlobeSimpleIcon size={16} aria-hidden /> Send through Farbaek instead
          </button>
        ) : null}
        {t.direction === "out" && t.state === "interrupted" ? (
          <button className={`btn ${t.canUseRelay ? "btn-secondary" : "btn-primary"} btn-sm`} type="button" disabled={busy !== null} onClick={() => void act("resume", () => mesh.resume(t.id))}>
            <ArrowCounterClockwiseIcon size={16} aria-hidden /> {t.canUseRelay ? "Try directly again" : "Resume"}
          </button>
        ) : null}
        {ACTIVE.has(t.state) ? (
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void act("cancel", () => mesh.cancel(t.id))}>
            Cancel
          </button>
        ) : null}
        {FINAL.has(t.state) || t.state === "interrupted" ? (
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void act("dismiss", () => mesh.dismiss(t.id))}>
            {t.direction === "in" && t.state === "interrupted" ? "Discard what arrived" : "Remove from list"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ComputersCard({ snapshot: s, busy, act }: { snapshot: MeshSnapshot; busy: string | null; act: Act }) {
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("");
  const [forgetting, setForgetting] = useState<string | null>(null);
  const unpaired = s.nearby.filter((n) => !n.paired);

  function pairByAddress(e: FormEvent) {
    e.preventDefault();
    void act("pair", () => mesh.pair({ address: address.trim(), port: Number(port) }));
  }

  return (
    <div className="card stack-sm">
      <div className="row">
        <h2>Computers</h2>
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy !== null} onClick={() => void act("look", () => mesh.setLooking(!s.looking))}>
          <MagnifyingGlassIcon size={16} aria-hidden /> {s.looking ? "Stop looking" : "Look for computers"}
        </button>
      </div>

      {s.looking || s.visible ? (
        unpaired.length === 0 ? (
          <p className="muted">{s.nearby.length === 0 ? "No computers found yet. On the other computer, open Nearby and choose Be visible." : "Every computer found is already paired."}</p>
        ) : (
          <ul className="devices">
            {unpaired.map((n) => (
              <li key={n.fingerprint} className="row">
                <span>
                  {n.name} <span className="mono small muted">{grouped(n.fingerprint)}</span>
                </span>
                <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null || Boolean(s.pairing && (s.pairing.state === "confirming" || s.pairing.state === "waiting"))} onClick={() => void act("pair", () => mesh.pair({ address: n.address, port: n.port }))}>
                  <LinkSimpleIcon size={16} aria-hidden /> Pair
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="muted">Look for computers on this network to pair with them. Looking stops after five minutes.</p>
      )}

      <details className="excluded">
        <summary>Connect by address</summary>
        <form className="row-start address-form" onSubmit={pairByAddress}>
          <label className="field">
            <span>Address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.20" inputMode="decimal" autoComplete="off" required />
          </label>
          <label className="field port-field">
            <span>Port</span>
            <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="off" required />
          </label>
          <button className="btn btn-secondary btn-sm" type="submit" disabled={busy !== null}>
            Pair
          </button>
        </form>
        <p className="small muted">Use this when the network hides computers from each other. The other computer shows its address while it&apos;s visible.</p>
      </details>

      <h3>Paired</h3>
      {s.devices.length === 0 ? (
        <p className="muted">No paired computers yet.</p>
      ) : (
        <ul className="devices">
          {s.devices.map((d) => (
            <li key={d.fingerprint} className="row">
              <span>
                {d.name}
                {d.via === "farbaek" ? <span className="small muted"> (phone or browser)</span> : null} <span className="mono small muted">{grouped(d.fingerprint)}</span>
              </span>
              {forgetting === d.fingerprint ? (
                <span className="row-start">
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => void act("forget", () => mesh.forget(d.fingerprint)).then(() => setForgetting(null))}>
                    Forget it
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setForgetting(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setForgetting(d.fingerprint)}>
                  Forget
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
